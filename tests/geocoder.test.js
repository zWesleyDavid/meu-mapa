// Busca (js/geocoder.js): ordem por proximidade e as duas consultas ao Photon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, nameMatches, rankResults, search, featureToPlace, reverseAddress } from '../js/geocoder.js';
import { CONFIG } from '../js/config.js';
import { json, hangingFetch, withFetch } from './helpers.js';

const near = { lng: -48.42, lat: -27.44 }; // Ingleses, Florianópolis
const P = (name, lng, lat, type = 'house', osmKey = 'amenity') => ({ id: `${name}@${lng}`, name, lng, lat, type, osmKey });

test('tokens: sem acento, sem apóstrofo, sem palavras vazias', () => {
  assert.deepEqual(tokens("McDonald’s"), ['mcdonalds']);
  assert.deepEqual(tokens('Drogaria São João'), ['drogaria', 'sao', 'joao']);
  assert.deepEqual(tokens('Aeroporto de Guarulhos'), ['aeroporto', 'guarulhos']);
  assert.deepEqual(tokens(''), []);
  assert.deepEqual(tokens(null), []);
});

test('nameMatches: todas as palavras, a última pode estar pela metade', () => {
  assert.equal(nameMatches('Drogaria São João', tokens('drogaria sao jo')), true);
  assert.equal(nameMatches("McDonald's", tokens('mc donalds')), true, 'junta as palavras');
  assert.equal(nameMatches('Aeroporto Hercílio Luz', tokens('aeroporto guarulhos')), false);
  assert.equal(nameMatches('Qualquer', []), false);
});

test('rankResults: mesmo nome → do mais perto para o mais longe', () => {
  const out = rankResults([
    P("McDonald's", -49.07, -26.92), // Blumenau
    P("McDonald's", -48.41, -27.45),
    P("McDonald's", -48.52, -27.59),
  ], "McDonald's", near);
  assert.deepEqual(out.map((p) => Math.round(p.dist / 1000)), [1, 19, 86]);
});

test('rankResults: cidade com o nome exato vem primeiro, mesmo longe', () => {
  const out = rankResults([P('Rua Blumenau', -48.42, -27.44, 'street', 'highway'), P('Blumenau', -49.07, -26.92, 'city', 'place')], 'Blumenau', near);
  assert.equal(out[0].type, 'city');
});

test('rankResults: busca específica que não bate com o nome mantém a ordem do Photon', () => {
  const out = rankResults([P('Aeroporto Internacional de Guarulhos', -46.47, -23.43), P('Aeroporto Hercílio Luz', -48.55, -27.67)], 'aeroporto de guarulhos', near);
  assert.equal(out[0].name, 'Aeroporto Internacional de Guarulhos');
});

test('rankResults: endereço com número mantém a ordem do Photon', () => {
  const out = rankResults([P('Rua Felipe Schmidt', -48.55, -27.59), P('Rua Felipe Schmidt', -48.42, -27.44, 'street', 'highway')], 'rua felipe schmidt 300', near);
  assert.equal(Math.round(out[0].dist / 1000), 21);
});

test('rankResults: sem localização, ordem original e sem distância', () => {
  const list = [P('B', 1, 1), P('A', 0, 0)];
  const out = rankResults(list, 'a', null);
  assert.deepEqual(out.map((p) => p.name), ['B', 'A']);
  assert.equal(out[0].dist, null);
});

test('featureToPlace: nome, endereço e tipo', () => {
  const p = featureToPlace({ geometry: { coordinates: [-48.5, -27.5] }, properties: { name: 'Café X', street: 'Rua A', housenumber: '10', district: 'Centro', city: 'Florianópolis', country: 'Brasil', osm_value: 'cafe', osm_type: 'N', osm_id: 7, type: 'house', osm_key: 'amenity' } });
  assert.equal(p.id, 'N7');
  assert.equal(p.address, 'Rua A, 10, Centro, Florianópolis');
  assert.equal(p.kind, 'Café');
  assert.equal(p.hasStreet, true);
});

// ---------------- search() com o Photon simulado ----------------
const F = (name, lng, lat, id) => ({ geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { name, osm_type: 'N', osm_id: id, osm_key: 'amenity', osm_value: 'fast_food', type: 'house', country: 'Brasil' } });

test('search: duas consultas (geral com viés e local com bbox), junta sem duplicar e ordena', async () => {
  await withFetch((url) => (url.includes('bbox=')
    ? json({ features: [F("McDonald's", -48.41, -27.45, 2), F("McDonald's", -48.43, -27.44, 3)] })
    : json({ features: [F("McDonald's", -49.07, -26.92, 1), F("McDonald's", -48.41, -27.45, 2)] })), async (calls) => {
    const out = await search("McDonald's", near);
    assert.equal(calls.length, 2);
    const g = new URL(calls.find((c) => !c.url.includes('bbox=')).url);
    assert.equal(g.searchParams.get('location_bias_scale'), String(CONFIG.geocoder.biasScale));
    assert.equal(g.searchParams.get('lat'), '-27.44000');
    const bbox = new URL(calls.find((c) => c.url.includes('bbox=')).url).searchParams.get('bbox').split(',').map(Number);
    assert.ok(bbox[0] < near.lng && near.lng < bbox[2] && bbox[1] < near.lat && near.lat < bbox[3], 'bbox em volta da posição');
    assert.equal(out.length, 3, 'o id 2 veio nas duas e aparece uma vez');
    assert.ok(out[0].dist <= out[1].dist && out[1].dist <= out[2].dist);
  });
});

test('search: sem localização, uma consulta só e sem viés', async () => {
  await withFetch(() => json({ features: [F('X', 0, 0, 9)] }), async (calls) => {
    const out = await search('x', null);
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).searchParams.has('lat'), false);
    assert.equal(out.length, 1);
  });
});

test('search: se a geral falhar, usa o resultado da local', async () => {
  await withFetch((url) => (url.includes('bbox=') ? json({ features: [F('Perto', -48.42, -27.44, 5)] }) : json({}, 500)), async () => {
    const out = await search('perto', near);
    assert.deepEqual(out.map((p) => p.name), ['Perto']);
  });
});

test('search: as duas falharam → erro (não lista vazia de "nada encontrado")', async () => {
  await withFetch(() => json({}, 502), async () => {
    await assert.rejects(search('x', near), { name: 'HttpError' });
  });
});

test('search: uma busca nova cancela a anterior (AbortError)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = hangingFetch();
  try {
    const first = search('mc', near);
    globalThis.fetch = async () => json({ features: [F('Mc', -48.42, -27.44, 1)] });
    const second = search('mcd', near);
    await assert.rejects(first, { name: 'AbortError' });
    assert.equal((await second).length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('search: servidor travado → TimeoutError no tempo máximo', async () => {
  const original = globalThis.fetch;
  const saved = CONFIG.geocoder.timeoutMs;
  globalThis.fetch = hangingFetch();
  CONFIG.geocoder.timeoutMs = 30;
  try {
    await assert.rejects(search('x', near), { name: 'TimeoutError' });
  } finally {
    globalThis.fetch = original;
    CONFIG.geocoder.timeoutMs = saved;
  }
});

test('reverseAddress: erro do servidor → null; sem conexão → erro', async () => {
  await withFetch(() => json({}, 500), async () => {
    assert.equal(await reverseAddress(-48.5, -27.5), null);
  });
  await withFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(reverseAddress(-48.5, -27.5), TypeError);
  });
});

test('reverseAddress: monta "Rua, número · bairro, cidade"', async () => {
  await withFetch(() => json({ features: [{ geometry: { coordinates: [0, 0] }, properties: { street: 'Rua A', housenumber: '5', district: 'Centro', city: 'Floripa' } }] }), async () => {
    assert.equal(await reverseAddress(0, 0), 'Rua A, 5 · Centro, Floripa');
  });
});
