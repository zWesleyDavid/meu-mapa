// Faixas e visão da junção (js/junction.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLanes, isComplex, junctionScene, junctionGeometry, junctionFrame, sceneOps, projectPoint, glyphPaths, laneIcon, SCENE } from '../js/junction.js';

const lanes = (...spec) => spec.map(([ind, valid]) => ({ indications: ind, valid }));

test('analyzeLanes: sem escolha a fazer → null', () => {
  assert.equal(analyzeLanes(null), null);
  assert.equal(analyzeLanes({ lanes: null }), null);
  assert.equal(analyzeLanes({ lanes: lanes([['straight'], true]) }), null, 'uma faixa só');
  assert.equal(analyzeLanes({ lanes: lanes([['straight'], true], [['right'], true]) }), null, 'todas servem');
  assert.equal(analyzeLanes({ lanes: lanes([['straight'], false], [['right'], false]) }), null, 'nenhuma marcada');
});

test('analyzeLanes: faixas da direita e saída à direita', () => {
  const info = analyzeLanes({ modifier: 'slight right', lanes: lanes([['left'], false], [['straight'], false], [['straight', 'slight right'], true], [['slight right'], true]) });
  assert.equal(info.hint, 'Use as 2 faixas da direita');
  assert.deepEqual(info.valid, [2, 3]);
  assert.equal(info.branch, 'right');
  assert.equal(info.k, 2);
  assert.equal(info.N, 4);
  assert.deepEqual(info.lanes.map((l) => l.glyph), ['left', 'straight', 'straight-right', 'slight-right']);
});

test('analyzeLanes: uma faixa da esquerda', () => {
  const info = analyzeLanes({ modifier: 'left', lanes: lanes([['left'], true], [['straight'], false], [['straight', 'right'], false]) });
  assert.equal(info.hint, 'Use a faixa da esquerda');
  assert.equal(info.branch, 'left');
  assert.equal(info.k, 1);
});

test('analyzeLanes: faixa do meio', () => {
  assert.equal(analyzeLanes({ lanes: lanes([['left'], false], [['straight'], true], [['right'], false]) }).hint, 'Use a 2ª faixa da esquerda');
  assert.equal(analyzeLanes({ lanes: lanes([['left'], false], [['straight'], true], [['straight'], true], [['right'], false]) }).hint, 'Use as faixas do meio');
});

test('isComplex: 3+ faixas ou manobras coladas', () => {
  assert.equal(isComplex(null), false);
  assert.equal(isComplex({ N: 3 }), true);
  assert.equal(isComplex({ N: 2 }, { at: 0 }, { at: 100 }), true);
  assert.equal(isComplex({ N: 2 }, { at: 0 }, { at: 400 }), false);
});

test('junctionScene: nomes vindos do mapa são escapados (sem HTML injetado)', () => {
  const info = analyzeLanes({ modifier: 'right', lanes: lanes([['straight'], false], [['right'], true]) });
  const html = junctionScene(info, { name: '<img src=x onerror=alert(1)>', modifier: 'right', destinations: 'A"B: <b>C</b>' });
  assert.ok(html.startsWith('<div class="jv"'));
  assert.ok(html.includes('<canvas class="jv-canvas"'));
  assert.ok(!html.includes('<img'), 'tag do nome não pode virar HTML');
  assert.ok(!html.includes('<b>C'), 'tag do destino não pode virar HTML');
  assert.ok(html.includes('&lt;'), 'aparece como texto escapado');
});

const exitRight = () => analyzeLanes({ modifier: 'slight right', lanes: lanes([['straight'], false], [['straight'], false], [['straight'], false], [['slight right'], true]) });
const exitLeft = () => analyzeLanes({ modifier: 'left', lanes: lanes([['left'], true], [['straight'], false], [['straight'], false]) });

test('junctionGeometry: saída à direita — alça com a última faixa, bolinha vai para ela', () => {
  const g = junctionGeometry(exitRight());
  assert.equal(g.N, 4);
  assert.equal(g.ramp, true);
  assert.equal(g.g, 3, 'a alça começa na 4ª faixa');
  assert.equal(g.mirrored, false);
  assert.equal(g.start, 2);
  assert.equal(g.target, 3);
  assert.equal(g.x0 + g.N * g.w, 320 + (g.N * g.w) / 2, 'pista centralizada no chão');
});

test('junctionGeometry: saída à esquerda é a da direita espelhada', () => {
  const g = junctionGeometry(exitLeft());
  assert.equal(g.mirrored, true);
  assert.equal(g.g, 2, 'no desenho espelhado a faixa da esquerda vira a última');
  assert.equal(g.lanes[2].glyph, 'right', 'seta "esquerda" é desenhada como "direita" e o espelho a desvira');
  assert.equal(g.lanes[2].valid, true);
});

test('junctionGeometry: seguir em frente não tem alça', () => {
  const info = analyzeLanes({ modifier: 'straight', lanes: lanes([['left'], false], [['straight'], true], [['right'], false]) });
  const g = junctionGeometry(info);
  assert.equal(g.ramp, false);
  assert.equal(g.target, 1);
});

test('junctionFrame: a cena anda pela distância percorrida (não por relógio)', () => {
  const g = junctionGeometry(exitRight());
  const a = junctionFrame(g, 300, 1000);
  const b = junctionFrame(g, 290, 1010);
  assert.equal(a.split - b.split, 10 * SCENE.PX_PER_M, '10 m mais perto = bifurcação 60 px mais perto');
  assert.equal(b.phase - a.phase, 10 * SCENE.PX_PER_M, 'tracejado e setas andam junto');
  assert.deepEqual(junctionFrame(g, 300, 1000), a, 'parado = mesma imagem');
});

test('junctionFrame: a bifurcação chega até a bolinha quando a distância zera', () => {
  const g = junctionGeometry(exitRight());
  assert.equal(junctionFrame(g, 0, 500).split, SCENE.CAR_D);
  assert.equal(junctionFrame(g, -20, 520).split, SCENE.CAR_D, 'não passa do ponto');
});

test('projectPoint: perto embaixo e largo, longe perto do horizonte; espelho inverte', () => {
  const [x0, y0] = projectPoint(320, 0);
  assert.equal(x0, SCENE.W / 2);
  assert.equal(y0, SCENE.H, 'pé da tela');
  const far = projectPoint(320, 100000);
  assert.ok(far[1] > SCENE.EYE_Y && far[1] - SCENE.EYE_Y < 2, 'longe encosta no horizonte');
  assert.ok(projectPoint(400, 500)[0] - SCENE.W / 2 < projectPoint(400, 0)[0] - SCENE.W / 2, 'longe fica mais estreito');
  const [mx] = projectPoint(400, 50, 0, true);
  assert.ok(Math.abs(mx - (SCENE.W - projectPoint(400, 50)[0])) < 1e-9);
});

const finiteIn = (ops) => ops.polys.every((p) => p.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y >= SCENE.EYE_Y - 0.01 && y <= SCENE.H + 40));

test('sceneOps: polígonos recortados e dentro da tela, nas três situações e em toda a aproximação', () => {
  const straight = junctionGeometry(analyzeLanes({ modifier: 'straight', lanes: lanes([['left'], false], [['straight'], true], [['right'], false]) }));
  for (const g of [junctionGeometry(exitRight()), junctionGeometry(exitLeft()), straight]) {
    for (const r of [500, 320, 200, 100, 30, 5, 0]) {
      const ops = sceneOps(g, junctionFrame(g, r, 1234 - r));
      assert.ok(ops.polys.length > 5);
      assert.ok(finiteIn(ops), `r=${r}`);
      assert.ok(ops.arrows.every((a) => a.m.every(Number.isFinite)));
    }
  }
});

test('sceneOps: a parte perto da bolinha é desenhada (o que cortava no celular)', () => {
  const g = junctionGeometry(analyzeLanes({ modifier: 'slight right', lanes: lanes([['straight'], false], [['straight'], false], [['slight right'], true]) }));
  const ops = sceneOps(g, junctionFrame(g, 310, 5000));
  // faixa da alça (asfalto) tem que chegar até o pé da tela
  const nearRamp = ops.polys.filter((p) => p.fill === 'asphalt' && Math.max(...p.pts.map((q) => q[1])) >= SCENE.H);
  assert.ok(nearRamp.length >= 2, 'pista que segue + faixa da alça chegando até embaixo');
  assert.ok(ops.arrows.some((a) => a.m[5] > 150), 'setas perto da bolinha também');
  assert.ok(ops.polys.some((p) => p.fill === 'route' && p.alpha === 1 && Math.max(...p.pts.map((q) => q[1])) >= SCENE.H), 'fita da rota desde embaixo');
});

test('sceneOps: setas e tracejado andam em direção à tela quando você avança', () => {
  const g = junctionGeometry(exitRight());
  const ys = (r, along) => sceneOps(g, junctionFrame(g, r, along)).arrows.map((a) => a.m[5]).sort((p, q) => p - q);
  const a = ys(300, 1000), b = ys(299, 1001);
  assert.ok(b.some((y, i) => y > a[i]), 'setas descem na tela');
});

test('sceneOps: saída à esquerda fica do lado esquerdo da tela', () => {
  const l = junctionGeometry(exitLeft());
  const ops = sceneOps(l, junctionFrame(l, 120, 0));
  const routeX = ops.polys.filter((p) => p.fill === 'route' && p.alpha === 1).flatMap((p) => p.pts.map((q) => q[0]));
  assert.ok(Math.min(...routeX) < SCENE.W / 2, 'a fita da rota vai para a esquerda');
});

test('glyphPaths: esquerda usa o desenho da direita espelhado', () => {
  assert.deepEqual(glyphPaths('left'), { ...glyphPaths('right'), mirror: true });
  assert.equal(glyphPaths('xyz').sh, glyphPaths('straight').sh);
});

test('junctionFrame: faixa certa acende antes; as outras apagam perto', () => {
  const g = junctionGeometry(exitRight());
  const far = junctionFrame(g, 330, 0), mid = junctionFrame(g, 200, 0), near = junctionFrame(g, 60, 0);
  assert.equal(far.ok, 0);
  assert.ok(mid.ok > 0.15);
  assert.equal(mid.bad > 0 && mid.bad < near.bad, true);
  assert.ok(Math.abs(near.bad - 0.45) < 1e-9);
});

test('junctionFrame: bolinha muda de faixa entre 260 m e 140 m, para o lado certo', () => {
  const r = junctionGeometry(exitRight()), l = junctionGeometry(exitLeft());
  assert.ok(junctionFrame(r, 100, 0).puckX > junctionFrame(r, 300, 0).puckX, 'direita: vai para a direita');
  assert.ok(junctionFrame(l, 100, 0).puckX < junctionFrame(l, 300, 0).puckX, 'esquerda: vai para a esquerda');
  assert.equal(junctionFrame(r, 300, 0).puckX, junctionFrame(r, 270, 0).puckX, 'antes de 260 m não mexe');
});

test('junctionFrame: vira só nos últimos 35 m e só quando há alça; placa sai nos últimos 40 m', () => {
  const g = junctionGeometry(exitRight());
  assert.equal(junctionFrame(g, 50, 0).turn, 0);
  assert.equal(junctionFrame(g, 0, 0).turn, -20);
  assert.equal(junctionFrame(g, 100, 0).gantryOut, 0);
  assert.equal(junctionFrame(g, 0, 0).gantryOut, 1);
  assert.equal(junctionFrame(g, 10, 0).chip, null, 'distância some no finalzinho');
  assert.equal(junctionFrame(g, 123, 0).chip, 120);
  const straight = junctionGeometry(analyzeLanes({ lanes: lanes([['left'], false], [['straight'], true], [['right'], false]) }));
  assert.equal(junctionFrame(straight, 0, 0).turn, 0);
});

test('laneIcon: desenho desconhecido usa "em frente"', () => {
  assert.equal(laneIcon('nao-existe'), laneIcon('straight'));
});

import { laneGlyph, LANE_GLYPHS } from '../js/junction.js';

test('setas de faixa: todas no desenho novo (haste + ponta sólida)', () => {
  for (const g of LANE_GLYPHS) {
    const svg = laneIcon(g);
    assert.match(svg, /viewBox="0 0 48 48"/, g);
    assert.match(svg, /class="sh"/, g);
    assert.match(svg, /class="hd"/, g);
  }
});

test('setas de faixa: as da esquerda são o espelho das da direita', () => {
  assert.ok(laneGlyph('left').includes('matrix(-1 0 0 1 48 0)'));
  assert.ok(laneGlyph('left').includes(laneGlyph('right')));
  assert.ok(!laneGlyph('right').includes('matrix'));
  assert.equal(laneGlyph('desconhecida'), laneGlyph('straight'));
});
