// Cálculo de rotas via OSRM + instruções em português.
import { CONFIG } from './config.js';

const cache = new Map();

/** Busca rotas entre dois pontos. Retorna [{ distance, duration, geometry, summary, steps }] */
export async function getRoutes(profile, from, to, { alternatives = true, steps = true } = {}) {
  const base = CONFIG.routing.profiles[profile]?.url;
  if (!base) throw new Error(`Perfil desconhecido: ${profile}`);
  const coords = `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}`;
  const params = new URLSearchParams({
    overview: 'full', geometries: 'geojson',
    steps: String(steps), alternatives: String(alternatives),
  });
  const url = `${base}${coords}?${params}`;
  if (cache.has(url)) return cache.get(url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Servidor de rotas respondeu ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.code === 'NoRoute' ? 'Não encontrei caminho entre esses pontos.' : 'Não foi possível calcular a rota.');
  }
  const routes = data.routes.map((r) => ({
    distance: r.distance,
    duration: r.duration,
    geometry: r.geometry,
    summary: r.legs.map((l) => l.summary).filter(Boolean).join(', '),
    steps: r.legs.flatMap((l) => l.steps || []).map(toStep),
  }));
  cache.set(url, routes);
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return routes;
}

// ---------------- Instruções ----------------

const SIDE = {
  'uturn': 'faça o retorno',
  'sharp right': 'vire acentuadamente à direita',
  'right': 'vire à direita',
  'slight right': 'mantenha-se à direita',
  'straight': 'siga em frente',
  'slight left': 'mantenha-se à esquerda',
  'left': 'vire à esquerda',
  'sharp left': 'vire acentuadamente à esquerda',
};

const ROTATION = {
  'sharp right': 135, 'right': 90, 'slight right': 45, 'straight': 0,
  'slight left': -45, 'left': -90, 'sharp left': -135,
};

const COMPASS = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];

const MASC = /^(viaduto|elevado|t[uú]nel|acesso|anel|contorno|largo|beco|caminho|boulevard|trevo|corredor|parque|cais|calçadão|morro|loteamento|condom[ií]nio)\b/i;

/** "na Rua X" / "no Viaduto Y" */
function em(name) {
  return MASC.test(name) ? `no ${name}` : `na ${name}`;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function ordinal(n) { return `${n}ª`; }

function streetName(s) {
  if (s.name && s.ref) return `${s.name} (${s.ref})`;
  return s.name || s.ref || '';
}

export function instruction(raw) {
  const m = raw.maneuver || {};
  const name = streetName(raw);
  const mod = m.modifier;
  const side = mod && mod.includes('right') ? 'à direita' : mod && mod.includes('left') ? 'à esquerda' : '';

  switch (m.type) {
    case 'depart': {
      const dir = COMPASS[Math.round(((m.bearing_after ?? 0) % 360) / 45) % 8];
      return name ? `Siga para ${dir} ${em(name)}` : `Siga para ${dir}`;
    }
    case 'arrive':
      return side ? `Você chegou. O destino fica ${side}` : 'Você chegou ao destino';
    case 'roundabout':
    case 'rotary': {
      const exit = m.exit ? `pegue a ${ordinal(m.exit)} saída` : 'siga pela saída indicada';
      return `Na rotatória, ${exit}${name ? ` para ${name}` : ''}`;
    }
    case 'exit roundabout':
    case 'exit rotary':
      return name ? `Saia da rotatória ${em(name)}` : 'Saia da rotatória';
    case 'roundabout turn':
      return `Na rotatória, ${SIDE[mod] || 'siga'}${name ? ` ${em(name)}` : ''}`;
    case 'merge':
      return name ? `Entre ${em(name)}` : `Incorpore-se à via${side ? ` ${side}` : ''}`;
    case 'on ramp':
      return `Pegue o acesso${side ? ` ${side}` : ''}${name ? ` para ${name}` : ''}`;
    case 'off ramp':
      return `Pegue a saída${side ? ` ${side}` : ''}${name ? ` para ${name}` : ''}`;
    case 'fork':
      return `Na bifurcação, mantenha-se ${side || 'no centro'}${name ? ` ${em(name)}` : ''}`;
    case 'end of road':
      return `No fim da via, ${SIDE[mod] || 'siga'}${name ? ` ${em(name)}` : ''}`;
    case 'new name':
      return name ? `Continue ${em(name)}` : 'Continue em frente';
    case 'continue':
      if (!mod || mod === 'straight') return name ? `Continue ${em(name)}` : 'Continue em frente';
      return cap(`${SIDE[mod]}${name ? ` para continuar ${em(name)}` : ''}`);
    case 'turn':
    default:
      if (mod === 'uturn') return name ? `Faça o retorno ${em(name)}` : 'Faça o retorno';
      return cap(`${SIDE[mod] || 'siga'}${name ? ` ${em(name)}` : ''}`);
  }
}

function stepIcon(raw) {
  const { type, modifier } = raw.maneuver || {};
  if (type === 'depart') return { name: 'start', rot: 0 };
  if (type === 'arrive') return { name: 'flag', rot: 0 };
  if (type?.includes('roundabout') || type?.includes('rotary')) return { name: 'roundabout', rot: 0 };
  if (modifier === 'uturn') return { name: 'uturn', rot: 0 };
  return { name: 'arrow', rot: ROTATION[modifier] ?? 0 };
}

function toStep(raw) {
  return {
    text: instruction(raw),
    distance: raw.distance,
    duration: raw.duration,
    location: raw.maneuver?.location,
    icon: stepIcon(raw),
    type: raw.maneuver?.type,
  };
}

/** Une passos triviais (ex.: "continue" de poucos metros) para uma lista mais limpa. */
export function cleanSteps(steps) {
  const out = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (prev && s.type === 'new name' && s.distance < 30) { prev.distance += s.distance; continue; }
    out.push({ ...s });
  }
  return out;
}
