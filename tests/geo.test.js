// Geometria da navegação (js/geo.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, bearing, prepareRoute, snap, pointAt, simSpeed } from '../js/geo.js';
import { CONFIG } from '../js/config.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b} ± ${tol}, veio ${a}`);

test('distance: 1 grau de latitude ≈ 111,2 km; mesmo ponto = 0', () => {
  near(distance([0, 0], [0, 1]), 111195, 50);
  assert.equal(distance([-48.5, -27.6], [-48.5, -27.6]), 0);
});

test('distance: simétrica', () => {
  const a = [-48.55, -27.6], b = [-48.42, -27.44];
  near(distance(a, b), distance(b, a), 1e-6);
});

test('bearing: pontos cardeais', () => {
  near(bearing([0, 0], [0, 1]), 0, 1e-9, 'norte');
  near(bearing([0, 0], [1, 0]), 90, 1e-9, 'leste');
  near(bearing([0, 1], [0, 0]), 180, 1e-9, 'sul');
  near(bearing([1, 0], [0, 0]), 270, 1e-9, 'oeste');
});

// rota reta para leste no equador: 0 → 0,01° (~1113 m), manobra no meio
const route = {
  distance: 1113,
  geometry: { coordinates: [[0, 0], [0.005, 0], [0.01, 0]] },
  steps: [{ location: [0, 0] }, { location: [0.005, 0] }, { location: [0.01, 0] }],
};

test('prepareRoute: distâncias acumuladas e posição de cada manobra', () => {
  const p = prepareRoute(route);
  assert.equal(p.cum.length, 3);
  near(p.total, 1113, 2);
  near(p.steps[1].at, p.total / 2, 1);
  near(p.steps[2].at, p.total, 1);
});

test('snap: projeta um ponto ao lado da rota', () => {
  const p = prepareRoute(route);
  const s = snap(p, [0.0025, 0.0001]); // ~11 m ao norte, a 1/4 do caminho
  near(s.offset, 11, 1.5, 'distância da rota');
  near(s.along, p.total / 4, 3, 'posição ao longo');
  near(s.bearing, 90, 1e-6);
  assert.equal(s.idx, 0);
});

test('snap: ponto antes do início fica preso ao começo', () => {
  const p = prepareRoute(route);
  const s = snap(p, [-0.001, 0]);
  assert.equal(s.along, 0);
  near(s.offset, 111, 2);
});

test('pointAt: começo, meio, depois do fim', () => {
  const p = prepareRoute(route);
  assert.deepEqual(pointAt(p, -5).point, [0, 0]);
  near(pointAt(p, p.total / 2).point[0], 0.005, 1e-6);
  assert.deepEqual(pointAt(p, p.total + 100).point, [0.01, 0]);
});

// ---------------- velocidade da simulação ----------------
const car = CONFIG.routing.profiles.car;
// 3 km de avenida rápida (25 m/s previstos), curva à direita, 1 km de rua lenta (8 m/s), chegada
const simRoute = {
  steps: [
    { type: 'depart', at: 0, distance: 3000, duration: 120 },
    { type: 'turn', modifier: 'right', at: 3000, distance: 1000, duration: 125 },
    { type: 'arrive', at: 4000, distance: 0, duration: 0 },
  ],
};
const run = (from, to, start = null) => {
  let v = start, along = from;
  const seen = [];
  while (along < to) { v = simSpeed(simRoute, along, v, car); along += v; seen.push({ along, v }); }
  return seen;
};

test('simSpeed: acelera aos poucos até a velocidade prevista do trecho', () => {
  const s = run(0, 1500);
  assert.ok(s[0].v <= car.sim.turn + 2, 'não sai em disparada');
  for (let i = 1; i < s.length; i++) assert.ok(s[i].v - s[i - 1].v <= 2 + 1e-9, 'no máximo +2 m/s por segundo');
  near(s[s.length - 1].v, 25, 0.01, 'na avenida');
});

test('simSpeed: freia antes da curva e chega nela devagar', () => {
  const s = run(0, 3000, null);
  const atTurn = s.find((x) => x.along >= 2990) || s[s.length - 1];
  assert.ok(atTurn.v <= car.sim.turn + 3.5, `velocidade na curva ${atTurn.v}`);
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].v - s[i].v <= 3 + 1e-9, 'no máximo −3 m/s por segundo');
});

test('simSpeed: rua lenta depois da curva e parada suave na chegada', () => {
  const s = run(3005, 4000, car.sim.turn);
  const mid = s.find((x) => x.along > 3400);
  near(mid.v, 8, 0.01, 'rua lenta');
  assert.ok(s[s.length - 1].v <= car.sim.min + 2.5, 'chega devagar');
});

test('simSpeed: respeita mínimo e máximo do perfil e usa a reserva sem tempo previsto', () => {
  const fast = { steps: [{ type: 'depart', at: 0, distance: 10000, duration: 100 }] }; // 100 m/s
  assert.equal(simSpeed(fast, 0, 29.5, car), car.sim.max, 'chega ao máximo e não passa');
  assert.equal(simSpeed(fast, 0, car.sim.max, car), car.sim.max);
  const noDur = { steps: [{ type: 'depart', at: 0, distance: 10000, duration: 0 }] };
  assert.equal(simSpeed(noDur, 0, car.simSpeed, car), car.simSpeed);
  const foot = CONFIG.routing.profiles.foot;
  assert.ok(simSpeed(fast, 0, 1.8, foot) <= foot.sim.max);
});
