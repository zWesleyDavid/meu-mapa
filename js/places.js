// Pontos próximos por categoria.
// Fonte 1: pontos já carregados nos blocos do mapa (instantâneo).
// Fonte 2: Overpass/OpenStreetMap (completo), com servidores reserva ("hedged requests").
import { CONFIG } from './config.js';
import { distance } from './geo.js';

const KIND = {
  restaurant: 'Restaurante', fast_food: 'Lanchonete', food_court: 'Praça de alimentação',
  cafe: 'Café', coffee: 'Café', bakery: 'Padaria', pastry: 'Confeitaria',
  fuel: 'Posto', pharmacy: 'Farmácia', chemist: 'Farmácia',
  supermarket: 'Supermercado', convenience: 'Conveniência', greengrocer: 'Hortifrúti', wholesale: 'Atacado',
};

function kindOf(tags, fallback) {
  return KIND[tags.amenity] || KIND[tags.shop] || KIND[tags.healthcare] || fallback;
}

// ---------------- Fonte 1: blocos do mapa ----------------
export function fromTiles(map, category, center, radius) {
  const style = map.getStyle?.();
  if (!style) return [];
  const src = Object.keys(style.sources || {}).find((k) => style.sources[k].type === 'vector');
  if (!src) return [];
  let feats = [];
  try { feats = map.querySourceFeatures(src, { sourceLayer: 'poi' }); } catch { return []; }
  const want = new Set(category.tileClasses);
  const out = [];
  for (const f of feats) {
    const p = f.properties || {};
    if (!want.has(p.class) && !want.has(p.subclass)) continue;
    if (f.geometry?.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates;
    const dist = distance([center.lng, center.lat], [lng, lat]);
    if (dist > radius) continue;
    out.push({
      id: `t${f.id ?? `${lng.toFixed(5)},${lat.toFixed(5)}`}`,
      name: p['name:pt'] || p.name || category.kind,
      kind: KIND[p.subclass] || KIND[p.class] || category.kind,
      address: '', lng, lat, dist, unnamed: !p.name, source: 'tiles',
    });
  }
  return out;
}

// ---------------- Fonte 2: Overpass ----------------
const cache = new Map(); // chave → { at, items }
let inflight = null;

function cacheKey(category, center, radius) {
  return `${category.id}:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${radius}`;
}

function buildQuery(category, center, radius) {
  const around = `(around:${radius},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  const parts = category.tags.map((t) => `nwr${t}${around};`).join('');
  // "out center" sem limite: pegamos tudo no raio e ordenamos por distância aqui
  return `[out:json][timeout:15];(${parts});out center tags;`;
}

/** Tenta o 1º servidor; se demorar, dispara o próximo; usa o primeiro que responder. */
export function hedgedFetch(query) {
  const servers = CONFIG.overpass;
  const controllers = [];
  let settled = false;
  let cancel = () => {};
  const promise = new Promise((resolve, reject) => {
    let failures = 0;
    let started = 0;
    const timers = [];
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      controllers.forEach((c) => c.abort());
      fn(v);
    };
    const launch = () => {
      if (settled || started >= servers.length) return;
      const i = started++;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const kill = setTimeout(() => ctrl.abort(), CONFIG.overpassTimeoutMs);
      fetch(servers[i], { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((data) => { clearTimeout(kill); done(resolve, data); })
        .catch(() => {
          clearTimeout(kill);
          failures++;
          if (failures >= servers.length) done(reject, new Error('Servidores de busca indisponíveis'));
          else launch(); // falhou rápido: tenta o próximo já
        });
      if (started < servers.length) timers.push(setTimeout(launch, CONFIG.overpassHedgeMs));
    };
    launch();
    cancel = () => done(reject, Object.assign(new Error('cancelado'), { name: 'AbortError' }));
  });
  return { promise, cancel: () => cancel() };
}

export async function fromOverpass(category, center, radius) {
  const key = cacheKey(category, center, radius);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.items;
  inflight?.cancel();
  const req = hedgedFetch(buildQuery(category, center, radius));
  inflight = req;
  const data = await req.promise;
  const items = (data.elements || []).map((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (lat == null) return null;
    const t = e.tags || {};
    const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    return {
      id: `${e.type}${e.id}`,
      name: t['name:pt'] || t.name || t.brand || kindOf(t, category.kind),
      kind: kindOf(t, category.kind),
      address: [street, t['addr:suburb']].filter(Boolean).join(' · '),
      hasStreet: !!street,
      lng, lat,
      dist: distance([center.lng, center.lat], [lng, lat]),
      unnamed: !(t.name || t.brand), source: 'osm',
    };
  }).filter(Boolean);
  cache.set(key, { at: Date.now(), items });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return items;
}

export function cancelNearby() { inflight?.cancel(); }

// ---------------- Combinação ----------------
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Junta as fontes sem duplicar (mesmo nome a menos de 60 m, ou qualquer um a menos de 12 m). */
export function mergePlaces(...lists) {
  const out = [];
  for (const list of lists) {
    for (const p of list) {
      const dup = out.find((q) => {
        const d = distance([p.lng, p.lat], [q.lng, q.lat]);
        return d < 12 || (d < 60 && norm(p.name) === norm(q.name));
      });
      if (dup) {
        // prefere o registro do OSM (tem endereço), mas mantém o nome se o outro não tiver
        if (p.source === 'osm' && dup.source !== 'osm') Object.assign(dup, p);
        continue;
      }
      out.push({ ...p });
    }
  }
  return out.sort((a, b) => (a.unnamed - b.unnamed) || (a.dist - b.dist)).slice(0, 40);
}
