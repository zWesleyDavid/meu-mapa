// Rotas (js/routing.js): instruções em português, limpeza de passos e chamadas ao OSRM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instruction, shortInstruction, cleanSteps, getRoutes } from '../js/routing.js';
import { CONFIG } from '../js/config.js';
import { json, hangingFetch, withFetch } from './helpers.js';

const step = (type, modifier, extra = {}) => ({ maneuver: { type, modifier, ...extra.maneuver }, name: extra.name || '', ref: extra.ref });

test('instruction: curvas e nomes com artigo certo', () => {
  assert.equal(instruction(step('turn', 'right', { name: 'Rua das Flores' })), 'Vire à direita na Rua das Flores');
  assert.equal(instruction(step('turn', 'left', { name: 'Viaduto Central' })), 'Vire à esquerda no Viaduto Central');
  assert.equal(instruction(step('turn', 'slight right')), 'Mantenha-se à direita');
  assert.equal(instruction(step('turn', 'uturn', { name: 'Av. Brasil' })), 'Faça o retorno na Av. Brasil');
});

test('instruction: partida com direção da bússola', () => {
  assert.equal(instruction(step('depart', undefined, { name: 'Rua A', maneuver: { bearing_after: 90 } })), 'Siga para leste na Rua A');
  assert.equal(instruction(step('depart', undefined, { maneuver: { bearing_after: 350 } })), 'Siga para norte');
});

test('instruction: rotatória, bifurcação, chegada', () => {
  assert.equal(instruction(step('roundabout', undefined, { name: 'Av. Beira-Mar', maneuver: { exit: 2 } })), 'Na rotatória, pegue a 2ª saída para Av. Beira-Mar');
  assert.equal(instruction(step('fork', 'slight left', { ref: 'SC-401' })), 'Na bifurcação, mantenha-se à esquerda na SC-401');
  assert.equal(instruction(step('arrive', 'right')), 'Você chegou. O destino fica à direita');
  assert.equal(instruction(step('arrive')), 'Você chegou ao destino');
});

test('instruction: nome + número da via', () => {
  assert.equal(instruction(step('turn', 'right', { name: 'Rodovia Admar Gonzaga', ref: 'SC-404' })), 'Vire à direita na Rodovia Admar Gonzaga (SC-404)');
});

test('instruction: tipo desconhecido não quebra', () => {
  assert.equal(instruction(step('algo-novo', 'straight')), 'Siga em frente');
  assert.equal(instruction({}), 'Siga');
});

test('shortInstruction: textos curtos da placa', () => {
  assert.equal(shortInstruction(step('roundabout', undefined, { maneuver: { exit: 3 } })), 'Rotatória, 3ª saída');
  assert.equal(shortInstruction(step('off ramp', 'right')), 'Saída à direita');
  assert.equal(shortInstruction(step('on ramp')), 'Acesso');
  assert.equal(shortInstruction(step('arrive')), 'Destino');
  assert.equal(shortInstruction(step('turn', 'left')), 'Vire à esquerda');
});

test('cleanSteps: junta trocas de nome curtas e tira a partida depois de cada parada', () => {
  const steps = [
    { type: 'depart', leg: 0, distance: 100 },
    { type: 'new name', leg: 0, distance: 20 },
    { type: 'turn', leg: 0, distance: 300 },
    { type: 'arrive', leg: 0, distance: 0 },
    { type: 'depart', leg: 1, distance: 50 },
    { type: 'new name', leg: 1, distance: 400 },
  ];
  const out = cleanSteps(steps);
  assert.deepEqual(out.map((s) => s.type), ['depart', 'turn', 'arrive', 'new name']);
  assert.equal(out[0].distance, 120, 'os 20 m somam no passo anterior');
  assert.equal(steps[0].distance, 100, 'não altera a lista original');
});

// ---------------- chamadas ao OSRM ----------------
const A = { lng: -48.55, lat: -27.6 };
const B = { lng: -48.5, lat: -27.58 };
const S = { lng: -48.52, lat: -27.59 };
const osrmLeg = (n) => ({
  summary: `Via ${n}`, distance: 1000, duration: 100,
  steps: [
    { maneuver: { type: 'depart', bearing_after: 90, location: [0, 0] }, name: `Rua ${n}`, distance: 900, duration: 90 },
    { maneuver: { type: 'arrive', location: [1, 1] }, name: '', distance: 0, duration: 0, intersections: [{ lanes: [{ indications: ['left'], valid: true }] }] },
  ],
});
const osrm = (legs = 1) => ({ code: 'Ok', routes: [{ distance: 1000 * legs, duration: 100 * legs, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, legs: Array.from({ length: legs }, (_, i) => osrmLeg(i + 1)) }] });

// cada teste usa pontos um pouco diferentes para não pegar o cache de outro
let shift = 0;
const pts = () => { shift += 0.0001; return [{ lng: A.lng + shift, lat: A.lat }, B]; };

test('getRoutes: monta a URL do perfil e normaliza a resposta', async () => {
  await withFetch(() => json(osrm()), async (calls) => {
    const [from, to] = pts();
    const [r] = await getRoutes('car', from, to);
    assert.ok(calls[0].url.startsWith(CONFIG.routing.profiles.car.url));
    assert.match(calls[0].url, /alternatives=true/);
    assert.match(calls[0].url, /steps=true/);
    assert.equal(r.summary, 'Via 1');
    assert.equal(r.steps.length, 2);
    assert.equal(r.steps[0].text, 'Siga para leste na Rua 1');
    assert.deepEqual(r.steps[1].lanes, [{ indications: ['left'], valid: true }]);
  });
});

test('getRoutes: com paradas, sem alternativas, e a chegada intermediária vira "parada"', async () => {
  await withFetch(() => json(osrm(2)), async (calls) => {
    const [from] = pts();
    const [r] = await getRoutes('bike', [from, S, B]);
    assert.match(calls[0].url, /alternatives=false/);
    assert.equal(calls[0].url.split('/driving/')[1].split('?')[0].split(';').length, 3);
    assert.equal(r.legs.length, 2);
    const stop = r.steps.find((s) => s.isStop);
    assert.equal(stop.text, 'Você chegou à parada 1');
    assert.equal(stop.stopIndex, 0);
  });
});

test('getRoutes: mesma consulta usa o cache (uma chamada só)', async () => {
  await withFetch(() => json(osrm()), async (calls) => {
    const [from, to] = pts();
    await getRoutes('car', from, to);
    await getRoutes('car', from, to);
    assert.equal(calls.length, 1);
  });
});

test('getRoutes: perfil desconhecido é erro imediato', async () => {
  await assert.rejects(getRoutes('aviao', A, B), /Perfil desconhecido/);
});

test('getRoutes: sem caminho → mensagem clara', async () => {
  await withFetch(() => json({ code: 'NoRoute', routes: [] }), async () => {
    const [from, to] = pts();
    await assert.rejects(getRoutes('car', from, to), { message: 'Não encontrei caminho entre esses pontos.' });
  });
});

test('getRoutes: servidor fora do ar → mensagem em português com o código', async () => {
  await withFetch(() => json({}, 503), async () => {
    const [from, to] = pts();
    await assert.rejects(getRoutes('car', from, to), (err) => /indisponível agora \(erro 503\)/.test(err.message) && err.cause?.status === 503);
  });
});

test('getRoutes: sem internet → mensagem em português', async () => {
  await withFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    const [from, to] = pts();
    await assert.rejects(getRoutes('car', from, to), { message: 'Sem conexão com o servidor de rotas. Verifique a internet.' });
  });
});

test('getRoutes: servidor travado → desiste no tempo máximo, sem guardar no cache', async () => {
  const original = globalThis.fetch;
  const saved = CONFIG.routing.timeoutMs;
  const calls = [];
  globalThis.fetch = hangingFetch(calls);
  CONFIG.routing.timeoutMs = 30;
  try {
    const [from, to] = pts();
    await assert.rejects(getRoutes('car', from, to), (err) => err.name === 'TimeoutError' && /demorou/.test(err.message));
    assert.equal(calls[0].init.signal.aborted, true);
    // depois que o servidor volta, a mesma rota é buscada de novo
    globalThis.fetch = async () => json(osrm());
    const [r] = await getRoutes('car', from, to);
    assert.equal(r.summary, 'Via 1');
  } finally {
    globalThis.fetch = original;
    CONFIG.routing.timeoutMs = saved;
  }
});

test('cleanSteps: ao juntar um passo curto, soma também o tempo', () => {
  const out = cleanSteps([{ type: 'turn', leg: 0, distance: 100, duration: 10 }, { type: 'new name', leg: 0, distance: 20, duration: 3 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].distance, 120);
  assert.equal(out[0].duration, 13);
});
