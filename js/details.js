// Detalhes de um lugar: etiquetas do OpenStreetMap (horário, contato, comodidades) + endereço.
import { hedgedFetch } from './places.js';
import { reverseAddress } from './geocoder.js';
import { distance } from './geo.js';
import { parseOpeningHours } from './hours.js';

const KINDS = {
  restaurant: 'Restaurante', fast_food: 'Lanchonete', cafe: 'Café', bar: 'Bar', pub: 'Bar', ice_cream: 'Sorveteria',
  food_court: 'Praça de alimentação', fuel: 'Posto de combustível', pharmacy: 'Farmácia', chemist: 'Farmácia',
  hospital: 'Hospital', clinic: 'Clínica', doctors: 'Consultório', dentist: 'Dentista', veterinary: 'Veterinário',
  bank: 'Banco', atm: 'Caixa eletrônico', school: 'Escola', university: 'Universidade', kindergarten: 'Creche',
  supermarket: 'Supermercado', convenience: 'Loja de conveniência', bakery: 'Padaria', pastry: 'Confeitaria',
  butcher: 'Açougue', greengrocer: 'Hortifrúti', clothes: 'Loja de roupas', shoes: 'Calçados', mall: 'Shopping',
  hairdresser: 'Cabeleireiro', beauty: 'Salão de beleza', hardware: 'Ferragens', electronics: 'Eletrônicos',
  mobile_phone: 'Celulares', optician: 'Ótica', car_repair: 'Oficina', car_wash: 'Lava-rápido', parking: 'Estacionamento',
  hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Pousada', museum: 'Museu', attraction: 'Atração',
  place_of_worship: 'Templo', police: 'Polícia', post_office: 'Correios', townhall: 'Prefeitura', library: 'Biblioteca',
  cinema: 'Cinema', theatre: 'Teatro', gym: 'Academia', fitness_centre: 'Academia', park: 'Parque', playground: 'Parquinho',
  marketplace: 'Mercado', bus_station: 'Rodoviária', pet: 'Pet shop', florist: 'Floricultura', books: 'Livraria',
  department_store: 'Loja de departamentos', furniture: 'Móveis', jewelry: 'Joalheria', laundry: 'Lavanderia',
  coworking_space: 'Coworking', charging_station: 'Recarga de carro elétrico', car: 'Concessionária',
};

const CUISINE = {
  pizza: 'Pizza', burger: 'Hambúrguer', japanese: 'Japonesa', sushi: 'Sushi', italian: 'Italiana', brazilian: 'Brasileira',
  regional: 'Regional', coffee_shop: 'Cafeteria', ice_cream: 'Sorvete', chicken: 'Frango', barbecue: 'Churrasco',
  steak_house: 'Churrascaria', seafood: 'Frutos do mar', chinese: 'Chinesa', mexican: 'Mexicana', arab: 'Árabe',
  lebanese: 'Libanesa', vegetarian: 'Vegetariana', vegan: 'Vegana', sandwich: 'Sanduíches', kebab: 'Kebab',
  thai: 'Tailandesa', indian: 'Indiana', french: 'Francesa', portuguese: 'Portuguesa', german: 'Alemã', korean: 'Coreana',
  peruvian: 'Peruana', acai: 'Açaí', juice: 'Sucos', breakfast: 'Café da manhã', buffet: 'Bufê', hot_dog: 'Cachorro-quente',
  pastel: 'Pastel', crepe: 'Crepe', donut: 'Donuts', cake: 'Bolos', fish: 'Peixe', international: 'Internacional',
};

const FUEL = {
  diesel: 'Diesel', 'diesel:s10': 'Diesel S10', ethanol: 'Etanol', e100: 'Etanol', cng: 'GNV', lpg: 'GLP',
  octane_87: 'Gasolina', octane_91: 'Gasolina', octane_95: 'Gasolina', octane_98: 'Gasolina aditivada',
  gasoline: 'Gasolina', petrol: 'Gasolina', e10: 'Gasolina', e25: 'Gasolina', e27: 'Gasolina', adblue: 'Arla 32',
};

const yes = (v) => v === 'yes' || v === 'only' || v === 'designated';
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function kindFromTags(t) {
  return KINDS[t.amenity] || KINDS[t.shop] || KINDS[t.healthcare] || KINDS[t.tourism] || KINDS[t.leisure] || KINDS[t.office]
    || (t.shop ? cap(t.shop.replace(/_/g, ' ')) : null) || (t.amenity ? cap(t.amenity.replace(/_/g, ' ')) : null);
}

function osmRef(place) {
  const id = String(place.id || '');
  let m = id.match(/^(node|way|relation)(\d+)$/);
  if (m) return { type: m[1], id: m[2] };
  m = id.match(/^([NWR])(\d+)$/);
  if (m) return { type: { N: 'node', W: 'way', R: 'relation' }[m[1]], id: m[2] };
  return null;
}

async function findElement(place) {
  const ref = osmRef(place);
  if (ref) {
    const data = await hedgedFetch(`[out:json][timeout:10];${ref.type}(${ref.id});out tags center;`).promise;
    const e = data.elements?.[0];
    if (e) return e;
  }
  // Sem id: procura perto do ponto um objeto com o mesmo nome (ou o mais próximo, se não tiver nome)
  const q = `[out:json][timeout:10];nwr(around:60,${place.lat.toFixed(6)},${place.lng.toFixed(6)})[~"^(amenity|shop|tourism|leisure|office|craft|healthcare)$"~"."];out tags center;`;
  const data = await hedgedFetch(q).promise;
  const els = (data.elements || []).map((e) => ({
    e, d: distance([place.lng, place.lat], [e.lon ?? e.center?.lon, e.lat ?? e.center?.lat]),
  }));
  const target = norm(place.name);
  const named = target ? els.filter(({ e }) => {
    const n = norm(e.tags?.name || e.tags?.brand);
    return n && (n === target || n.includes(target) || target.includes(n));
  }) : [];
  const pool = named.length ? named : els.filter(({ d }) => d <= 25);
  pool.sort((a, b) => a.d - b.d);
  return pool[0]?.e || null;
}

function addressFromTags(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
  if (!street) return null;
  const area = [t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city']].filter(Boolean).join(', ');
  return [street, area].filter(Boolean).join(' · ');
}

function url(v) {
  if (!v) return null;
  const s = v.split(';')[0].trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function social(v, base) {
  if (!v) return null;
  const s = v.split(';')[0].trim();
  if (/^https?:\/\//i.test(s)) {
    const handle = s.replace(/\/+$/, '').split('/').pop();
    return { url: s, label: `@${handle.replace(/^@/, '')}` };
  }
  const handle = s.replace(/^@/, '');
  return { url: `${base}${handle}`, label: `@${handle}` };
}

function features(t) {
  const f = [];
  const push = (cond, label) => { if (cond && !f.includes(label)) f.push(label); };
  push(yes(t.delivery), 'Delivery');
  push(yes(t.takeaway), 'Para viagem');
  push(yes(t.drive_through), 'Drive-thru');
  push(yes(t.outdoor_seating), 'Mesas ao ar livre');
  push(t.internet_access === 'wlan' || t.internet_access === 'yes' || t.internet_access === 'wifi', 'Wi-Fi');
  push(yes(t.air_conditioning), 'Ar-condicionado');
  push(t.wheelchair === 'yes', 'Acessível');
  push(t.wheelchair === 'limited', 'Acessibilidade parcial');
  push(yes(t['diet:vegetarian']), 'Opções vegetarianas');
  push(yes(t['diet:vegan']), 'Opções veganas');
  push(yes(t.compressed_air), 'Calibrador');
  push(yes(t.car_wash), 'Lava-rápido');
  push(yes(t.toilets), 'Banheiro');
  push(yes(t['payment:pix']), 'Pix');
  push(yes(t['payment:credit_cards']) || yes(t['payment:cards']) || yes(t['payment:debit_cards']), 'Cartão');
  push(yes(t['payment:cash']), 'Dinheiro');
  push(yes(t.self_service), 'Self-service');
  push(t.opening_hours === '24/7', 'Aberto 24h');
  return f;
}

function fuels(t) {
  const out = [];
  for (const [k, v] of Object.entries(t)) {
    if (!k.startsWith('fuel:') || !yes(v)) continue;
    const label = FUEL[k.slice(5)];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

const cache = new Map();

/** → detalhes ou null. Nunca lança: falhas viram "sem informações". */
export async function getDetails(place) {
  const key = place.id || `${place.lng},${place.lat}`;
  if (cache.has(key)) return cache.get(key);

  const needAddress = !(place.address && place.hasStreet);
  const [elR, addrR] = await Promise.allSettled([findElement(place), needAddress ? reverseAddress(place.lng, place.lat) : Promise.resolve(null)]);
  const e = elR.status === 'fulfilled' ? elR.value : null;
  const t = e?.tags || {};
  const hoursRaw = t.opening_hours || null;

  const details = {
    found: !!e,
    name: t['name:pt'] || t.name || null,
    kind: e ? kindFromTags(t) : null,
    brand: t.brand && t.brand !== t.name ? t.brand : null,
    address: addressFromTags(t) || (place.hasStreet ? place.address : null) || (addrR.status === 'fulfilled' ? addrR.value : null) || place.address || null,
    hours: hoursRaw ? { raw: hoursRaw, parsed: parseOpeningHours(hoursRaw) } : null,
    phone: (t.phone || t['contact:phone'] || t['contact:mobile'] || '').split(';')[0].trim() || null,
    website: url(t.website || t['contact:website']),
    instagram: social(t['contact:instagram'] || t.instagram, 'https://instagram.com/'),
    facebook: social(t['contact:facebook'] || t.facebook, 'https://facebook.com/'),
    whatsapp: (t['contact:whatsapp'] || '').replace(/\D/g, '') || null,
    email: t.email || t['contact:email'] || null,
    cuisine: (t.cuisine || '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => CUISINE[c] || cap(c.replace(/_/g, ' '))),
    fuels: fuels(t),
    features: features(t),
    description: t['description:pt'] || t.description || null,
    level: t.level || null,
    osm: e ? { type: e.type, id: e.id, editUrl: `https://www.openstreetmap.org/edit?${e.type}=${e.id}`, viewUrl: `https://www.openstreetmap.org/${e.type}/${e.id}` } : null,
    lookupFailed: elR.status === 'rejected',
  };
  if (elR.status === 'fulfilled') cache.set(key, details); // não guarda falha de rede
  return details;
}
