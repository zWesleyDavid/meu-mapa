// Cálculo de rotas via OSRM + instruções em português.
import { CONFIG } from './config.js';
import { fetchJSON } from './core.js';

const cache = new Map();

/** Erro de rede/servidor → mensagem para quem está usando o app (mantém a causa em `cause`). */
function routingError(err) {
  let msg = 'Não foi possível calcular a rota.';
  if (err.name === 'TimeoutError') msg = 'O servidor de rotas demorou para responder. Tente de novo.';
  else if (err.name === 'HttpError') msg = `O servidor de rotas está indisponível agora (erro ${err.status}). Tente de novo em instantes.`;
  else if (err.name === 'TypeError') msg = 'Sem conexão com o servidor de rotas. Verifique a internet.';
  return Object.assign(new Error(msg, { cause: err }), { name: err.name });
}

/**
 * Busca rotas. Aceita (perfil, de, para, opções) ou (perfil, [pontos...], opções) para rotas com paradas.
 * Retorna [{ distance, duration, geometry, summary, steps, legs }]
 */
export async function getRoutes(profile, a, b, c) {
  const points = Array.isArray(a) ? a : [a, b];
  const { alternatives = true, steps = true } = (Array.isArray(a) ? b : c) || {};
  const base = CONFIG.routing.profiles[profile]?.url;
  if (!base) throw new Error(`Perfil desconhecido: ${profile}`);
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const params = new URLSearchParams({
    overview: 'full', geometries: 'geojson',
    // o OSRM só calcula alternativas para rotas sem paradas
    steps: String(steps), alternatives: String(alternatives && points.length === 2),
  });
  const url = `${base}${coords}?${params}`;
  if (cache.has(url)) return cache.get(url);

  let data;
  try {
    data = await fetchJSON(url, { timeout: CONFIG.routing.timeoutMs });
  } catch (err) {
    throw routingError(err);
  }
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.code === 'NoRoute' ? 'Não encontrei caminho entre esses pontos.' : 'Não foi possível calcular a rota.');
  }
  const routes = data.routes.map((r) => ({
    distance: r.distance,
    duration: r.duration,
    geometry: r.geometry,
    summary: r.legs.map((l) => l.summary).filter(Boolean).join(', '),
    legs: r.legs.map((l) => ({ distance: l.distance, duration: l.duration })),
    steps: r.legs.flatMap((l, li) => (l.steps || []).map((st) => toStep(st, li, r.legs.length))),
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

const ICON_BY_MOD = {
  'straight': 'straight', 'right': 'right', 'left': 'left',
  'slight right': 'slight-right', 'slight left': 'slight-left',
  'sharp right': 'sharp-right', 'sharp left': 'sharp-left', 'uturn': 'uturn',
};

function stepIcon(raw) {
  const { type, modifier } = raw.maneuver || {};
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type?.includes('roundabout') || type?.includes('rotary')) return 'roundabout';
  return ICON_BY_MOD[modifier] || 'straight';
}

/** Versão curta, sem nome de rua (para a placa quando a via não tem nome). */
export function shortInstruction(raw) {
  const m = raw.maneuver || {};
  const mod = m.modifier;
  const side = mod && mod.includes('right') ? 'à direita' : mod && mod.includes('left') ? 'à esquerda' : '';
  switch (m.type) {
    case 'arrive': return 'Destino';
    case 'depart': return 'Siga em frente';
    case 'roundabout': case 'rotary': return m.exit ? `Rotatória, ${m.exit}ª saída` : 'Rotatória';
    case 'exit roundabout': case 'exit rotary': return 'Saia da rotatória';
    case 'fork': return `Mantenha-se ${side || 'no centro'}`;
    case 'on ramp': return `Acesso ${side}`.trim();
    case 'off ramp': return `Saída ${side}`.trim();
    case 'merge': return 'Incorpore-se';
    default: return cap(SIDE[mod] || 'Siga em frente');
  }
}

function toStep(raw, leg = 0, legCount = 1) {
  const isStop = raw.maneuver?.type === 'arrive' && leg < legCount - 1;
  return {
    leg,
    isStop,
    stopIndex: isStop ? leg : null,
    text: isStop ? `Você chegou à parada ${leg + 1}` : instruction(raw),
    short: isStop ? `Parada ${leg + 1}` : shortInstruction(raw),
    name: streetName(raw),
    distance: raw.distance,
    duration: raw.duration,
    location: raw.maneuver?.location,
    icon: stepIcon(raw),
    type: raw.maneuver?.type,
    modifier: raw.maneuver?.modifier,
    // faixas no cruzamento da manobra (quando cadastradas no OSM): [{ indications: [...], valid }]
    lanes: raw.intersections?.[0]?.lanes || null,
    destinations: raw.destinations || null,
    ref: raw.ref || null,
  };
}

/** Une passos triviais (ex.: "continue" de poucos metros) para uma lista mais limpa. */
export function cleanSteps(steps) {
  const out = [];
  for (const s of steps) {
    if (s.type === 'depart' && s.leg > 0) continue; // a partida depois de cada parada é redundante
    const prev = out[out.length - 1];
    if (prev && s.type === 'new name' && s.distance < 30) { prev.distance += s.distance; continue; }
    out.push({ ...s });
  }
  return out;
}
