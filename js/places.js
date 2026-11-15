// Pontos próximos por categoria (Overpass API / OpenStreetMap).
import { CONFIG } from './config.js';
import { distance } from './geo.js';

let controller;

export async function nearby(category, center) {
  controller?.abort();
  controller = new AbortController();
  const r = CONFIG.categoryRadius;
  const q = `[out:json][timeout:20];nwr${category.filter}(around:${r},${center.lat.toFixed(5)},${center.lng.toFixed(5)});out center 60;`;
  const res = await fetch(CONFIG.overpass, {
    method: 'POST',
    body: new URLSearchParams({ data: q }),
    signal: controller.signal,
  });
  if (!res.ok) throw new Error(`Busca por categoria falhou (${res.status})`);
  const data = await res.json();
  return (data.elements || [])
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (lat == null) return null;
      const t = e.tags || {};
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
      return {
        id: `${e.type}${e.id}`,
        name: t.name || category.kind,
        kind: category.kind,
        address: [street, t['addr:suburb'] || t['addr:city']].filter(Boolean).join(' · '),
        lng, lat,
        dist: distance([center.lng, center.lat], [lng, lat]),
        unnamed: !t.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.unnamed - b.unnamed) || (a.dist - b.dist))
    .slice(0, 30);
}
