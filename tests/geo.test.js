// Geometria da navegação (js/geo.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, bearing, prepareRoute, snap, pointAt } from '../js/geo.js';

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
