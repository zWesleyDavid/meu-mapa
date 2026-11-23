// Busca (js/geocoder.js): ordem por proximidade e as duas consultas ao Photon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, nameMatches, rankResults, dedupe, splitHouseNumber, search, featureToPlace, reverseAddress } from '../js/geocoder.js';
import { CONFIG } from '../js/config.js';
import { json, hangingFetch, withFetch } from './helpers.js';

const near = { lng: -48.42, lat: -27.44 }; // Ingleses, Florianópolis
const P = (name, lng, lat, type = 'house', osmKey = 'amenity', extra = {}) => ({ id: `${name}@${lng}`, name, lng, lat, type, osmKey, osmValue: '', housenumber: '', city: '', ...extra });

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

test('rankResults: o endereço com o número digitado vem antes da rua sem número', () => {
  // (o Photon devolve o número no campo housenumber; antes este teste não o tinha)
  const out = rankResults([P('Rua Felipe Schmidt, 300', -48.55, -27.59, 'house', 'place', { housenumber: '300' }), P('Rua Felipe Schmidt', -48.42, -27.44, 'street', 'highway')], 'rua felipe schmidt 300', near);
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

test('Photon: pede o nome local (lang=default), não o inglês do navegador', async () => {
  await withFetch(() => json({ features: [] }), async (calls) => {
    await search('masp', near);
    await reverseAddress(-48.5, -27.5);
    assert.ok(calls.length >= 3);
    for (const c of calls) assert.equal(new URL(c.url).searchParams.get('lang'), 'default', c.url);
  });
});

// ---------------- regras do teste ao vivo (nov/2026) ----------------
test('rankResults: bairro longe com o nome exato NÃO passa na frente do lugar perto', () => {
  // "Parque Ibirapuera" trazia um bairro de Goiás (801 km) antes do parque (2 km)
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P('Parque Ibirapuera', -49.336, -16.812, 'district', 'place', { osmValue: 'suburb' }),
    P('Parque Ibirapuera', -46.659, -23.588, 'other', 'leisure', { osmValue: 'park' }),
  ], 'Parque Ibirapuera', sp);
  assert.equal(out[0].osmKey, 'leisure');
});

test('rankResults: nome exatamente igual antes de quem só contém as palavras (mesmo mais perto)', () => {
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P('Lagoa Parque Ibirapuera', -46.661, -23.582, 'other', 'water'),
    P('Parque Ibirapuera', -46.659, -23.588, 'other', 'leisure', { osmValue: 'park' }),
    P('Parque Ibirapuera', -49.336, -16.812, 'district', 'place', { osmValue: 'suburb' }), // igual, mas a 800 km
  ], 'Parque Ibirapuera', sp);
  assert.deepEqual(out.map((p) => Math.round(p.dist / 1000)), [3, 2, 801]);
});

test('rankResults: ponto de ônibus com o nome do lugar fica depois do lugar', () => {
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P('Parque Ibirapuera', -46.662, -23.579, 'house', 'highway', { osmValue: 'bus_stop' }), // mais perto
    P('Parque Ibirapuera', -46.659, -23.588, 'other', 'leisure', { osmValue: 'park' }),
  ], 'Parque Ibirapuera', sp);
  assert.deepEqual(out.map((p) => p.osmValue), ['park', 'bus_stop']);
});

test('rankResults: cidade que vem como "district" do Photon (relação place=city) ainda é cidade', () => {
  const out = rankResults([P('Rua Campinas', -48.42, -27.44, 'street', 'highway'), P('Campinas', -47.06, -22.9, 'district', 'place', { osmValue: 'city' })], 'Campinas', near);
  assert.equal(out[0].name, 'Campinas');
});

test('rankResults: "Rua Augusta 500" sem o número no Photon → a rua perto primeiro', () => {
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P('Rua Augusta', -46.53, -23.66, 'street', 'highway', { city: 'Santo André' }),            // 20 km
    P('Rua Constâncio Colalilo, 500', -46.5, -23.45, 'house', 'place', { housenumber: '500' }), // outra rua
    P('Rua Augusta Diogo Ayala, 500', -47.27, -22.82, 'house', 'place', { housenumber: '500' }), // outra rua, 96 km
    P('Rua Augusta', -46.659, -23.556, 'street', 'highway', { city: 'São Paulo' }),            // 600 m
  ], 'Rua Augusta 500', sp);
  assert.equal(out[0].city, 'São Paulo');
  assert.equal(out[1].city, 'Santo André');
});

test('rankResults: abreviação "Av" bate com "Avenida" no endereço exato', () => {
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P("McDonald's", -46.656, -23.561),
    P('Avenida Paulista, 1000', -46.652, -23.566, 'house', 'place', { housenumber: '1000' }),
  ], 'Av Paulista 1000', sp);
  assert.equal(out[0].housenumber, '1000');
});

test('splitHouseNumber: número no fim; rodovia e número solto não contam', () => {
  assert.deepEqual(splitHouseNumber('Rua Augusta 500'), { street: 'Rua Augusta', number: '500' });
  assert.deepEqual(splitHouseNumber('Av. Paulista, 1000'), { street: 'Av. Paulista', number: '1000' });
  assert.deepEqual(splitHouseNumber('Rua X nº 12'), { street: 'Rua X', number: '12' });
  assert.equal(splitHouseNumber('Rua 13 de Maio').number, null);
  assert.equal(splitHouseNumber('BR 101').number, null);
  assert.equal(splitHouseNumber('500').number, null);
});

test('dedupe: trechos da mesma rua, mesma cidade (ponto + limite) e endereço repetido', () => {
  const out = dedupe([
    P('Rua Augusta', -46.659, -23.556, 'street', 'highway', { city: 'São Paulo' }),
    P('Rua Augusta', -46.661, -23.559, 'street', 'highway', { city: 'São Paulo' }),
    P('Rua Augusta', -46.53, -23.66, 'street', 'highway', { city: 'Santo André' }), // outra cidade: fica
    { ...P('Campinas', -47.06, -22.906, 'district', 'place'), id: 'R1' },
    { ...P('Campinas', -47.06, -22.906, 'city', 'place'), id: 'R2' },
    { ...P('Campinas', -45.4, -22.96, 'district', 'place'), id: 'N3' },              // outro bairro longe: fica
    { ...P('Rua A, 500', -47.27, -22.82), address: 'Área Cura, Sumaré', id: 'a1' },
    { ...P('Rua A, 500', -47.27, -22.82), address: 'Área Cura, Sumaré', id: 'a2' },
  ]);
  assert.equal(out.filter((p) => p.name === 'Rua Augusta').length, 2);
  assert.deepEqual(out.filter((p) => p.name === 'Campinas').map((p) => p.id), ['R1', 'N3']);
  assert.equal(out.filter((p) => p.name === 'Rua A, 500').length, 1);
});

test('search: com número no fim, faz uma consulta a mais só pela rua (perto de você)', async () => {
  await withFetch(() => json({ features: [] }), async (calls) => {
    await search('Rua Augusta 500', near);
    const qs = calls.map((c) => new URL(c.url).searchParams.get('q'));
    assert.equal(calls.length, 3);
    assert.ok(qs.includes('Rua Augusta'));
    assert.ok(calls.find((c) => new URL(c.url).searchParams.get('q') === 'Rua Augusta').url.includes('bbox='));
  });
  await withFetch(() => json({ features: [] }), async (calls) => {
    await search("McDonald's", near);
    assert.equal(calls.length, 2, 'sem número: só as duas de sempre');
  });
});

test('rankResults: palavra solta ("farmácia") continua só pela distância', () => {
  const sp = { lng: -46.6559, lat: -23.5614 };
  const out = rankResults([
    P('Farmácia', -46.5, -23.7),                // "Farmácia" sem nome próprio, 20 km
    P('Farmácia DrugsStore', -46.661, -23.565), // 700 m
  ], 'farmácia', sp);
  assert.equal(out[0].name, 'Farmácia DrugsStore');
});
