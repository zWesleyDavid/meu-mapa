// Pontos por categoria e detalhes do lugar (js/places.js, js/details.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePlaces, hedgedFetch } from '../js/places.js';
import { getDetails, kindFromTags } from '../js/details.js';
import { CONFIG } from '../js/config.js';
import { json, withFetch } from './helpers.js';

const P = (name, lng, lat, extra = {}) => ({ id: `${name}${lng}`, name, lng, lat, dist: 0, unnamed: false, source: 'tiles', ...extra });

test('mergePlaces: mesmo nome a menos de 60 m é o mesmo lugar; o do OSM vence', () => {
  const tiles = [P('Café Bonde', -48.5, -27.5, { dist: 10 })];
  const osm = [P('Cafe Bonde', -48.5003, -27.5, { dist: 12, source: 'osm', address: 'Rua A, 1' })]; // ~30 m
  const out = mergePlaces(tiles, osm);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'osm');
  assert.equal(out[0].address, 'Rua A, 1');
});

test('mergePlaces: nomes diferentes a mais de 12 m continuam separados', () => {
  assert.equal(mergePlaces([P('A', -48.5, -27.5)], [P('B', -48.5003, -27.5)]).length, 2);
});

test('mergePlaces: sem nome vai para o fim; o resto por distância; máximo 40', () => {
  const list = [P('Longe', 0, 0, { dist: 900 }), P('Sem nome', 0.1, 0, { dist: 5, unnamed: true }), P('Perto', 0.2, 0, { dist: 50 })];
  assert.deepEqual(mergePlaces(list).map((p) => p.name), ['Perto', 'Longe', 'Sem nome']);
  const many = Array.from({ length: 60 }, (_, i) => P(`L${i}`, i * 0.01, 0, { dist: i }));
  assert.equal(mergePlaces(many).length, 40);
});

test('hedgedFetch: servidor que falha rápido passa para o próximo', async () => {
  await withFetch((url) => (url === CONFIG.overpass[0] ? json({}, 500) : json({ elements: [{ id: 1 }] })), async (calls) => {
    const data = await hedgedFetch('[out:json];node(1);out;').promise;
    assert.deepEqual(data, { elements: [{ id: 1 }] });
    assert.equal(calls[0].url, CONFIG.overpass[0]);
    assert.equal(calls[0].init.method, 'POST');
  });
});

test('hedgedFetch: todos falham → erro com mensagem em português', async () => {
  await withFetch(() => json({}, 503), async (calls) => {
    await assert.rejects(hedgedFetch('x').promise, { message: 'Servidores de busca indisponíveis' });
    assert.equal(calls.length, CONFIG.overpass.length);
  });
});

test('hedgedFetch: cancelar rejeita com AbortError e cancela as requisições', async () => {
  const signals = [];
  await withFetch((url, init) => { signals.push(init.signal); return new Promise(() => {}); }, async () => {
    const req = hedgedFetch('x');
    req.cancel();
    await assert.rejects(req.promise, { name: 'AbortError' });
    assert.ok(signals.every((s) => s.aborted));
  });
});

// ---------------- detalhes ----------------
const overpassWith = (tags) => (url) => (url.includes('photon')
  ? json({ features: [] })
  : json({ elements: [{ type: 'node', id: 42, lat: -27.5, lon: -48.5, tags }] }));

test('getDetails: lê contato, horário e cozinha das etiquetas do OSM', async () => {
  await withFetch(overpassWith({ name: 'Bar do Zé', amenity: 'bar', opening_hours: 'Mo-Su 18:00-02:00', phone: '+55 48 99999-0000;+55 48 3333-0000', 'contact:whatsapp': '+55 (48) 99999-0000', cuisine: 'pizza;burger', 'addr:street': 'Rua A', 'addr:housenumber': '1' }), async () => {
    const d = await getDetails({ id: 'N42', name: 'Bar do Zé', lng: -48.5, lat: -27.5 });
    assert.equal(d.found, true);
    assert.equal(d.kind, 'Bar');
    assert.equal(d.phone, '+55 48 99999-0000', 'só o primeiro telefone');
    assert.equal(d.whatsapp, '5548999990000', 'só dígitos');
    assert.equal(d.hours.parsed.week[0][0].from, 1080);
    assert.equal(d.cuisine.length, 2);
    assert.equal(d.osm.editUrl, 'https://www.openstreetmap.org/edit?node=42');
  });
});

test('getDetails: links do mapa nunca viram "javascript:" (sempre https)', async () => {
  await withFetch(overpassWith({ name: 'X', website: 'javascript:alert(1)', 'contact:instagram': 'meu_bar', facebook: 'https://facebook.com/meubar/' }), async () => {
    const d = await getDetails({ id: 'N43', name: 'X', lng: -48.5, lat: -27.5 });
    assert.ok(d.website.startsWith('https://'), d.website);
    assert.deepEqual(d.instagram, { url: 'https://instagram.com/meu_bar', label: '@meu_bar' });
    assert.deepEqual(d.facebook, { url: 'https://facebook.com/meubar/', label: '@meubar' });
  });
});

test('getDetails: falha de rede não lança e não fica guardada no cache', async () => {
  await withFetch(() => json({}, 503), async () => {
    const d = await getDetails({ id: 'N44', name: 'Y', lng: -48.5, lat: -27.5, address: 'Rua B', hasStreet: true });
    assert.equal(d.found, false);
    assert.equal(d.lookupFailed, true);
    assert.equal(d.address, 'Rua B', 'usa o endereço que já tinha');
  });
  await withFetch(overpassWith({ name: 'Y', amenity: 'cafe' }), async () => {
    const d = await getDetails({ id: 'N44', name: 'Y', lng: -48.5, lat: -27.5 });
    assert.equal(d.found, true, 'tenta de novo depois que a rede volta');
  });
});

test('kindFromTags: tradução e reserva com o valor da etiqueta', () => {
  assert.equal(kindFromTags({ amenity: 'pharmacy' }), 'Farmácia');
  assert.equal(kindFromTags({ shop: 'bicycle_repair' }), 'Bicycle repair');
  assert.equal(kindFromTags({}), null);
});
