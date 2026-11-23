// Busca e geocodificação reversa via Photon. Normaliza tudo para o formato Place:
// { id, name, address, lng, lat, kind, bbox? }
import { CONFIG } from './config.js';
import { fetchJSON } from './core.js';
import { distance } from './geo.js';

const KIND_LABELS = {
  restaurant: 'Restaurante', cafe: 'Café', bar: 'Bar', fast_food: 'Lanchonete',
  hospital: 'Hospital', clinic: 'Clínica', pharmacy: 'Farmácia', school: 'Escola',
  university: 'Universidade', supermarket: 'Supermercado', fuel: 'Posto de combustível',
  bank: 'Banco', hotel: 'Hotel', park: 'Parque', beach: 'Praia', bus_station: 'Rodoviária',
  aerodrome: 'Aeroporto', mall: 'Shopping', city: 'Cidade', town: 'Cidade', village: 'Vila',
  suburb: 'Bairro', neighbourhood: 'Bairro', state: 'Estado', country: 'País',
  residential: 'Rua', primary: 'Avenida/rodovia', secondary: 'Via', tertiary: 'Via',
  house: 'Endereço', island: 'Ilha', peak: 'Morro', museum: 'Museu', place_of_worship: 'Templo',
};

export function featureToPlace(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.street, p.housenumber].filter(Boolean).join(', ');
  const name = p.name || street || p.city || p.state || 'Local sem nome';
  const parts = [
    p.name && street ? street : null,
    p.district || p.locality,
    p.city && p.city !== name ? p.city : null,
    p.state && p.state !== name ? p.state : null,
    p.country !== 'Brasil' && p.country !== 'Brazil' ? p.country : null,
  ].filter(Boolean);
  return {
    id: `${p.osm_type || 'X'}${p.osm_id || `${lng},${lat}`}`,
    name,
    address: [...new Set(parts)].join(', '),
    kind: KIND_LABELS[p.osm_value] || '',
    hasStreet: !!street,
    type: p.type || '',          // house | street | city | district | other…
    osmKey: p.osm_key || '',
    osmValue: p.osm_value || '',
    housenumber: p.housenumber || '',
    city: p.city || p.county || '',
    lng, lat,
    bbox: p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : null, // [w,s,e,n]
  };
}

let controller;

// ---------------- Busca com prioridade para o que está perto ----------------
// Duas consultas em paralelo ao Photon:
//  1) geral, com viés de localização (o Photon já pesa a distância);
//  2) só dentro de ~30 km de você, para garantir que as opções próximas apareçam
//     mesmo quando existe uma mais "famosa" longe (ex.: McDonald's, mercado, farmácia).
// Depois reordenamos (rankResults) e tiramos repetidos (dedupe):
//  1) cidade, estado ou país com o nome exato (ex.: "Campinas"), mesmo longe;
//  2) endereço com o número digitado (ex.: "Av Paulista 1000"), na ordem do Photon;
//  3) o que tem o nome digitado — incluindo bairros e, se houver número no fim, a rua sem
//     o número: primeiro o nome exatamente igual (até ~30 km), depois o resto, cada grupo
//     do mais perto para o mais longe; pontos de ônibus com o mesmo nome do lugar vão
//     para o fim deste grupo (quem busca "Parque Ibirapuera" quer o parque);
//  4) o resto, na ordem do Photon (buscas muito específicas etc.).

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the']);
export function tokens(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t && !STOP.has(t));
}
const AREA_TYPES = new Set(['city', 'county', 'state', 'country', 'district', 'locality']);
const isArea = (p) => AREA_TYPES.has(p.type) || p.osmKey === 'place' || p.osmKey === 'boundary';
// áreas grandes: as únicas que passam na frente de tudo quando o nome é exato
const BIG_TYPES = new Set(['city', 'county', 'state', 'country']);
const BIG_VALUES = new Set(['city', 'town', 'municipality', 'state', 'country', 'county', 'administrative']);
const isBigArea = (p) => BIG_TYPES.has(p.type) || (p.osmKey === 'place' && BIG_VALUES.has(p.osmValue));
const isStreet = (p) => p.osmKey === 'highway' && p.type === 'street';
const isTransitStop = (p) => (p.osmKey === 'highway' && p.osmValue === 'bus_stop')
  || p.osmKey === 'public_transport' || (p.osmKey === 'railway' && /platform|stop|halt/.test(p.osmValue || ''));

// abreviações comuns de logradouro (para "Av Paulista 1000" bater com "Avenida Paulista, 1000")
const ABBR = { av: 'avenida', r: 'rua', al: 'alameda', pc: 'praca', pca: 'praca', rod: 'rodovia', est: 'estrada', tv: 'travessa', trav: 'travessa', estr: 'estrada', lgo: 'largo', vd: 'viaduto' };
const streetKey = (s) => tokens(s).filter((t) => !/^\d+[a-z]?$/.test(t)).map((t) => ABBR[t] || t).join(' ');

/** Número da casa no fim da busca ("Rua Augusta 500", "Av. Paulista, 1000", "Rua X nº 12"). */
const TRAILING_NUMBER = /[\s,]+(?:n[º°o.]?\s*)?(\d+[a-z]?)\s*$/i;
export function splitHouseNumber(query) {
  const q = String(query || '').trim();
  const m = q.match(TRAILING_NUMBER);
  if (!m) return { street: q, number: null };
  const street = q.slice(0, m.index).trim();
  // precisa de uma palavra de verdade antes do número ("BR 101", "SP 55" são rodovias, não endereço)
  return tokens(street).some((t) => /^[a-z]{3,}$/.test(t)) ? { street, number: m[1].toLowerCase() } : { street: q, number: null };
}

/** O nome contém todas as palavras digitadas (a última pode estar pela metade). */
export function nameMatches(name, qTokens) {
  if (!qTokens.length) return false;
  const nt = tokens(name);
  const joined = nt.join('');
  return qTokens.every((t, i) => nt.some((w) => (i === qTokens.length - 1 ? w.startsWith(t) : w === t || w.startsWith(t)))
    || joined.includes(t)) || joined.includes(qTokens.join(''));
}

export function rankResults(places, query, near) {
  const q = tokens(query);
  const qKey = q.join(' ');
  const { street, number } = splitHouseNumber(query);
  const wanted = number ? streetKey(street) : null;
  const nearM = CONFIG.geocoder.nearKm * 1000;
  const list = places.map((p, i) => ({
    ...p, order: i,
    dist: near ? distance([near.lng, near.lat], [p.lng, p.lat]) : null,
  }));
  const pinned = [], address = [], close = [], rest = [];
  for (const p of list) {
    const sameStreet = number && streetKey(p.name) === wanted;
    if (isBigArea(p) && tokens(p.name).join(' ') === qKey) pinned.push(p);
    // o endereço exato (rua + número) perto de você; longe, entra no grupo seguinte pela distância
    else if (sameStreet && (p.housenumber || '').toLowerCase() === number && (p.dist == null || p.dist <= nearM)) address.push(p);
    else if (near && !isBigArea(p) && (nameMatches(p.name, q) || (sameStreet && (isStreet(p) || p.housenumber)))) close.push(p);
    else rest.push(p);
  }
  // nome exatamente igual e perto de você antes de quem só contém as palavras ("Parque
  // Ibirapuera" antes de "Lagoa Parque Ibirapuera"); o igual que está longe (bairro de mesmo
  // nome em outro estado) volta para a ordem por distância. Dentro de cada grupo, do mais perto
  // para o mais longe.
  // (só com 2+ palavras: "farmácia" sozinha não deve pôr na frente um ponto sem nome chamado "Farmácia")
  const partial = (p) => (q.length > 1 && tokens(p.name).join(' ') === qKey && p.dist <= nearM ? 0 : 1);
  close.sort((a, b) => (isTransitStop(a) - isTransitStop(b)) || (partial(a) - partial(b)) || (a.dist - b.dist));
  return [...pinned, ...address, ...close, ...rest].map(({ order, ...p }) => p);
}

/**
 * Tira repetidos, mantendo o primeiro (o mais bem colocado):
 * mesmo nome e mesmo endereço; trechos da mesma rua na mesma cidade (o OpenStreetMap divide
 * as ruas em vários pedaços); a mesma cidade ou bairro vindo como ponto e como limite.
 */
export function dedupe(places) {
  const out = [];
  const key = (p) => tokens(p.name).join(' ');
  const far = (a, b, m) => distance([a.lng, a.lat], [b.lng, b.lat]) > m;
  for (const p of places) {
    const k = key(p);
    const dup = out.some((o) => key(o) === k && (
      (p.address && p.address === o.address && !far(p, o, 300))
      || (isStreet(p) && isStreet(o) && p.city === o.city && !far(p, o, 5000))
      || (isArea(p) && isArea(o) && !far(p, o, 15000))));
    if (!dup) out.push(p);
  }
  return out;
}

async function photon(params, signal) {
  const data = await fetchJSON(`${CONFIG.geocoder.search}?${params}`, { signal, timeout: CONFIG.geocoder.timeoutMs });
  return (data.features || []).map(featureToPlace);
}

export async function search(query, near) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const g = CONFIG.geocoder;
  const base = { q: query, limit: g.limit, lang: g.lang };
  const global = new URLSearchParams(base);
  let local = null;
  if (near) {
    const lat = near.lat.toFixed(5), lon = near.lng.toFixed(5);
    global.set('lat', lat); global.set('lon', lon);
    global.set('zoom', g.biasZoom); global.set('location_bias_scale', g.biasScale);
    const dLat = g.nearKm / 111;
    const dLng = g.nearKm / (111 * Math.cos(near.lat * Math.PI / 180));
    local = new URLSearchParams({ ...base, lat, lon, zoom: 14, location_bias_scale: 0.05,
      bbox: [near.lng - dLng, near.lat - dLat, near.lng + dLng, near.lat + dLat].map((v) => v.toFixed(4)).join(',') });
  }
  // "Rua Augusta 500": se o Photon não tiver aquele número, a busca com número às vezes não
  // traz a rua; uma consulta a mais, só pela rua e só perto de você, garante a rua certa.
  const { street, number } = splitHouseNumber(query);
  let streetOnly = null;
  if (local && number) { streetOnly = new URLSearchParams(local); streetOnly.set('q', street); }
  const [gr, lr, sr] = await Promise.allSettled([
    photon(global, signal),
    local ? photon(local, signal) : Promise.resolve([]),
    streetOnly ? photon(streetOnly, signal) : Promise.resolve([]),
  ]);
  // busca substituída por outra mais nova: não devolve nada desta
  if (signal.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' });
  if (gr.status === 'rejected' && (lr.status === 'rejected' || !lr.value.length)) throw gr.reason;
  const seen = new Set();
  const merged = [...(gr.value || []), ...(lr.status === 'fulfilled' ? lr.value : []), ...(sr.status === 'fulfilled' ? sr.value : [])]
    .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  return dedupe(rankResults(merged, query, near)).slice(0, g.show);
}

export async function reverse(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1, lang: CONFIG.geocoder.lang });
  const data = await fetchJSON(`${CONFIG.geocoder.reverse}?${params}`, { timeout: CONFIG.geocoder.timeoutMs });
  const f = data.features?.[0];
  if (!f) return null;
  const place = featureToPlace(f);
  // Mantém o ponto exato clicado, não o do objeto encontrado.
  return { ...place, lng, lat };
}

/** Endereço legível de um ponto: "Rua X, 123 · Bairro, Cidade" (ou null). */
export async function reverseAddress(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1, lang: CONFIG.geocoder.lang });
  let data;
  try {
    data = await fetchJSON(`${CONFIG.geocoder.reverse}?${params}`, { timeout: CONFIG.geocoder.timeoutMs });
  } catch (err) {
    if (err.name === 'HttpError') return null; // como antes: erro do servidor = sem endereço
    throw err;
  }
  const f = data.features?.[0];
  if (!f) return null;
  const p = f.properties || {};
  const street = p.street || (p.osm_key === 'highway' ? p.name : null);
  const line1 = street ? [street, p.housenumber].filter(Boolean).join(', ') : null;
  const area = [p.district || p.locality, p.city].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
  return [line1, area].filter(Boolean).join(' · ') || null;
}
