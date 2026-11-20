// Faixas e visão da junção (js/junction.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLanes, isComplex, junctionSVG, laneIcon } from '../js/junction.js';

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

test('junctionSVG: nomes vindos do mapa são escapados (sem HTML injetado)', () => {
  const info = analyzeLanes({ modifier: 'right', lanes: lanes([['straight'], false], [['right'], true]) });
  const svg = junctionSVG(info, { name: '<img src=x onerror=alert(1)>', modifier: 'right', destinations: 'A"B: <b>C</b>' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(!svg.includes('<img'), 'tag do nome não pode virar HTML');
  assert.ok(!svg.includes('<b>'), 'tag do destino não pode virar HTML');
  assert.ok(svg.includes('&lt;'), 'aparece como texto escapado');
});

test('laneIcon: desenho desconhecido usa "em frente"', () => {
  assert.equal(laneIcon('nao-existe'), laneIcon('straight'));
});
