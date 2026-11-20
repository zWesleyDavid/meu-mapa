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
// Depois reordenamos: área com o nome exato (cidade, bairro) primeiro; em seguida tudo
// cujo nome bate com o que foi digitado, do mais perto para o mais longe; por fim o resto
// na ordem do Photon (buscas muito específicas, endereço com número etc.).

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the']);
export function tokens(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t && !STOP.has(t));
}
const AREA_TYPES = new Set(['city', 'county', 'state', 'country', 'district', 'locality']);
const isArea = (p) => AREA_TYPES.has(p.type) || p.osmKey === 'place' || p.osmKey === 'boundary';

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
  const list = places.map((p, i) => ({
    ...p, order: i,
    dist: near ? distance([near.lng, near.lat], [p.lng, p.lat]) : null,
  }));
  const pinned = [], close = [], rest = [];
  for (const p of list) {
    if (isArea(p) && tokens(p.name).join(' ') === qKey) pinned.push(p);
    else if (near && !isArea(p) && nameMatches(p.name, q)) close.push(p);
    else rest.push(p);
  }
  close.sort((a, b) => a.dist - b.dist);
  return [...pinned, ...close, ...rest].map(({ order, ...p }) => p);
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
  const base = { q: query, limit: g.limit };
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
  const [gr, lr] = await Promise.allSettled([photon(global, signal), local ? photon(local, signal) : Promise.resolve([])]);
  // busca substituída por outra mais nova: não devolve nada desta
  if (signal.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' });
  if (gr.status === 'rejected' && (lr.status === 'rejected' || !lr.value.length)) throw gr.reason;
  const seen = new Set();
  const merged = [...(gr.value || []), ...(lr.status === 'fulfilled' ? lr.value : [])]
    .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  return rankResults(merged, query, near).slice(0, g.show);
}

export async function reverse(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1 });
  const data = await fetchJSON(`${CONFIG.geocoder.reverse}?${params}`, { timeout: CONFIG.geocoder.timeoutMs });
  const f = data.features?.[0];
  if (!f) return null;
  const place = featureToPlace(f);
  // Mantém o ponto exato clicado, não o do objeto encontrado.
  return { ...place, lng, lat };
}

/** Endereço legível de um ponto: "Rua X, 123 · Bairro, Cidade" (ou null). */
export async function reverseAddress(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1 });
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
