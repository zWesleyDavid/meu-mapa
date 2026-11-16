// Busca e geocodificação reversa via Photon. Normaliza tudo para o formato Place:
// { id, name, address, lng, lat, kind, bbox? }
import { CONFIG } from './config.js';

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
    lng, lat,
    bbox: p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : null, // [w,s,e,n]
  };
}

let controller;

export async function search(query, near) {
  controller?.abort();
  controller = new AbortController();
  const params = new URLSearchParams({ q: query, limit: CONFIG.geocoder.limit });
  if (near) { params.set('lat', near.lat.toFixed(5)); params.set('lon', near.lng.toFixed(5)); }
  const res = await fetch(`${CONFIG.geocoder.search}?${params}`, { signal: controller.signal });
  if (!res.ok) throw new Error(`Busca falhou (${res.status})`);
  const data = await res.json();
  return (data.features || []).map(featureToPlace);
}

export async function reverse(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1 });
  const res = await fetch(`${CONFIG.geocoder.reverse}?${params}`);
  if (!res.ok) throw new Error(`Falha ao identificar o local (${res.status})`);
  const data = await res.json();
  const f = data.features?.[0];
  if (!f) return null;
  const place = featureToPlace(f);
  // Mantém o ponto exato clicado, não o do objeto encontrado.
  return { ...place, lng, lat };
}

/** Endereço legível de um ponto: "Rua X, 123 · Bairro, Cidade" (ou null). */
export async function reverseAddress(lng, lat) {
  const params = new URLSearchParams({ lon: lng, lat, limit: 1 });
  const res = await fetch(`${CONFIG.geocoder.reverse}?${params}`);
  if (!res.ok) return null;
  const f = (await res.json()).features?.[0];
  if (!f) return null;
  const p = f.properties || {};
  const street = p.street || (p.osm_key === 'highway' ? p.name : null);
  const line1 = street ? [street, p.housenumber].filter(Boolean).join(', ') : null;
  const area = [p.district || p.locality, p.city].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
  return [line1, area].filter(Boolean).join(' · ') || null;
}
