// Modo 3D (js/map3d.js): o que ligar, parede da rota, prédio do destino e setas 3D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effective3D, corridor, pointInRing, pickBuilding, roundedOutline, mix, puckSVG } from '../js/map3d.js';
import { distance } from '../js/geo.js';

const ALL_ON = { mapMode: '3d', b3dBuildings: true, b3dTerrain: true, b3dSky: true, b3dDest: true, b3dRoute: true, arrow: 'waze', lowBatteryFlat: true };

test('effective3D: plano desliga tudo e usa a bolinha de sempre', () => {
  const e = effective3D({ ...ALL_ON, mapMode: 'flat' }, null);
  assert.deepEqual(e, { on: false, lowBattery: false, buildings: false, terrain: false, sky: false, dest: false, route: false, arrow: 'ball' });
});

test('effective3D: 3D respeita cada chave', () => {
  const e = effective3D({ ...ALL_ON, b3dTerrain: false, b3dRoute: false, arrow: 'ball3d' }, { level: 0.9, charging: false });
  assert.equal(e.on, true);
  assert.equal(e.buildings, true);
  assert.equal(e.terrain, false);
  assert.equal(e.route, false);
  assert.equal(e.arrow, 'ball3d');
});

test('effective3D: bateria fraca fora da tomada volta ao plano', () => {
  const low = effective3D(ALL_ON, { level: 0.15, charging: false });
  assert.equal(low.on, false);
  assert.equal(low.lowBattery, true);
  assert.equal(low.arrow, 'ball');
  assert.equal(effective3D(ALL_ON, { level: 0.15, charging: true }).on, true, 'carregando: mantém o 3D');
  assert.equal(effective3D({ ...ALL_ON, lowBatteryFlat: false }, { level: 0.05, charging: false }).on, true, 'regra desligada');
  assert.equal(effective3D(ALL_ON, { level: 0.2, charging: false }).on, true, '20% em ponto ainda não é "abaixo de 20%"');
  assert.equal(effective3D(ALL_ON, null).on, true, 'sem informação de bateria');
});

test('effective3D: valor de seta desconhecido vira bolinha', () => {
  assert.equal(effective3D({ ...ALL_ON, arrow: 'foguete' }, null).arrow, 'ball');
});

test('corridor: um quadrilátero fechado por trecho, com a largura pedida', () => {
  const fc = corridor([[-48.5, -27.6], [-48.499, -27.6], [-48.499, -27.599]], 2.4);
  assert.equal(fc.features.length, 2);
  const ring = fc.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4], 'anel fechado');
  const width = distance(ring[0], ring[3]);
  assert.ok(Math.abs(width - 2.4) < 0.05, `largura ${width}`);
  const len = distance(ring[0], ring[1]);
  const seg = distance([-48.5, -27.6], [-48.499, -27.6]);
  assert.ok(Math.abs(len - (seg + 2.4)) < 0.1, 'estende meia largura em cada ponta para fechar as curvas');
});

test('corridor: pontos repetidos e entradas vazias não quebram', () => {
  assert.equal(corridor([[-48.5, -27.6], [-48.5, -27.6]]).features.length, 0);
  assert.equal(corridor([]).features.length, 0);
  assert.equal(corridor(null).features.length, 0);
});

const square = (lng, lat, d) => [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]];

test('pointInRing', () => {
  const ring = square(0, 0, 1);
  assert.equal(pointInRing([0, 0], ring), true);
  assert.equal(pointInRing([2, 0], ring), false);
});

test('pickBuilding: o prédio que contém o ponto, com altura do OSM', () => {
  const p = [-48.5, -27.6];
  const feats = [
    { geometry: { type: 'Polygon', coordinates: [square(-48.5003, -27.6, 0.0001)] }, properties: { render_height: 30 } },
    { geometry: { type: 'Polygon', coordinates: [square(-48.5, -27.6, 0.0001)] }, properties: { render_height: 12, render_min_height: 2 } },
  ];
  assert.deepEqual(pickBuilding(feats, p), { geometry: feats[1].geometry, height: 12, base: 2 });
});

test('pickBuilding: ponto no pátio (buraco) não conta; pega o mais próximo até 15 m', () => {
  const p = [-48.5, -27.6];
  const withHole = { geometry: { type: 'Polygon', coordinates: [square(-48.5, -27.6, 0.0003), square(-48.5, -27.6, 0.0001)] }, properties: { height: 9 } };
  const b = pickBuilding([withHole], p);
  assert.ok(b, 'a borda interna fica a ~11 m: vale como o mais próximo');
  assert.equal(b.height, 9);
  const far = { geometry: { type: 'Polygon', coordinates: [square(-48.501, -27.6, 0.0001)] }, properties: {} };
  assert.equal(pickBuilding([far], p), null, 'a ~90 m não é o prédio do lugar');
});

test('pickBuilding: sem altura usa 8 m; MultiPolygon funciona; nada → null', () => {
  const p = [-48.5, -27.6];
  const multi = { geometry: { type: 'MultiPolygon', coordinates: [[square(-48.51, -27.6, 0.0001)], [square(-48.5, -27.6, 0.0001)]] }, properties: { render_height: '' } };
  assert.equal(pickBuilding([multi], p).height, 8);
  assert.equal(pickBuilding([], p), null);
  assert.equal(pickBuilding(null, p), null);
});

test('roundedOutline: cantos levemente arredondados, simétrico, sem passar dos vértices', () => {
  const poly = [[0, 7], [5.2, -4.6], [0, -2], [-5.2, -4.6]];
  const { pts, mids } = roundedOutline(poly, [1, 0.9, 0.7, 0.9]);
  assert.equal(pts.length, 20);
  assert.equal(mids.length, 4);
  assert.ok(Math.abs(pts[mids[0]][0]) < 1e-9, 'meio da ponta no eixo');
  assert.ok(pts[mids[0]][1] < 7 && pts[mids[0]][1] > 6.3, 'a ponta fica só um pouco abaixo do vértice');
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minX = Math.min(...pts.map((p) => p[0]));
  assert.ok(Math.abs(maxX + minX) < 1e-9, 'simétrica');
  assert.ok(maxX < 5.2, 'não ultrapassa a asa');
});

test('mix: mistura de cores', () => {
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(mix('#C8FF3D', '#C8FF3D', 0.3), '#C8FF3D');
});

const nums = (svg) => [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);

for (const style of ['waze', 'ball3d']) {
  test(`puckSVG ${style}: SVG válido, números finitos e dentro da caixa`, () => {
    const svg = puckSVG(style, 0, 55);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!/NaN|Infinity|undefined/.test(svg));
    const box = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const coords = [...svg.matchAll(/d="([^"]+)"/g)].flatMap((m) => nums(m[1]));
    assert.ok(coords.every((v) => v >= box[0] && v <= box[0] + box[2]), 'tudo cabe no desenho');
  });

  test(`puckSVG ${style}: visto de cima não tem volume; inclinado tem`, () => {
    const flat = puckSVG(style, 0, 0);
    const tilted = puckSVG(style, 0, 60);
    assert.notEqual(flat, tilted);
    assert.ok((tilted.match(/<path/g) || []).length > (flat.match(/<path/g) || []).length, 'mais camadas de volume quando inclina');
  });

  test(`puckSVG ${style}: o rumo gira o desenho`, () => {
    assert.notEqual(puckSVG(style, 0, 50), puckSVG(style, 90, 50));
  });
}

test('puckSVG: cores do tema', () => {
  const svg = puckSVG('waze', 0, 50, { color: '#2F7DE1', ink: '#0E2A47' });
  assert.ok(svg.includes('#0E2A47'));
  assert.ok(!svg.includes('#C8FF3D'));
});

test('puckSVG waze: ponta para cima com rumo 0, para baixo com 180', () => {
  const tipY = (svg) => Math.min(...[...svg.matchAll(/<line x1="[^"]+" y1="([^"]+)"/g)].map((m) => +m[1]));
  assert.ok(tipY(puckSVG('waze', 0, 0)) < 0);
  assert.ok(tipY(puckSVG('waze', 180, 0)) > 0);
});

import { inflatePolygon } from '../js/map3d.js';

test('inflatePolygon: quadrado cresce ~0,6 m de cada lado, nos dois sentidos de anel', () => {
  const sq = square(-48.5, -27.6, 0.0001); // ~22 m × ~20 m
  for (const ring of [sq, sq.slice().reverse()]) {
    const g = inflatePolygon({ type: 'Polygon', coordinates: [ring] }, 0.6);
    const r = g.coordinates[0];
    assert.equal(r.length, 5);
    assert.deepEqual(r[0], r[4], 'continua fechado');
    const w0 = distance(ring[0], ring[1]);
    const w1 = distance(r[0], r[1]);
    assert.ok(Math.abs(w1 - w0 - 1.2) < 0.05, `largura cresceu ${w1 - w0}`);
    assert.ok(pointInRing([-48.5, -27.6], r), 'o centro continua dentro');
    // o canto saiu para fora (mais longe do centro)
    assert.ok(distance([-48.5, -27.6], r[0]) > distance([-48.5, -27.6], ring[0]));
  }
});

test('inflatePolygon: prédio em L (canto côncavo) não se cruza e mantém os pátios', () => {
  const L = [[0, 0], [0.0002, 0], [0.0002, 0.0001], [0.0001, 0.0001], [0.0001, 0.0002], [0, 0.0002], [0, 0]].map(([x, y]) => [-48.5 + x, -27.6 + y]);
  const hole = square(-48.49995, -27.59995, 0.00001);
  const g = inflatePolygon({ type: 'Polygon', coordinates: [L, hole] }, 0.6);
  assert.equal(g.coordinates.length, 2);
  assert.deepEqual(g.coordinates[1], hole);
  const inner = g.coordinates[0][3]; // canto côncavo
  assert.ok(Math.abs(distance(inner, L[3]) - 0.6 * Math.SQRT2) < 0.05, 'o canto de dentro também anda ~0,6 m (na diagonal)');
});

test('inflatePolygon: entradas que não são polígono passam direto', () => {
  assert.equal(inflatePolygon(null, 1), null);
  const mp = { type: 'MultiPolygon', coordinates: [] };
  assert.equal(inflatePolygon(mp, 1), mp);
});
