// Formatação de distância e tempo (js/format.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDistance, fmtDuration, fmtDurationShort, fmtCoords, fmtArrival } from '../js/format.js';

test('fmtDistance: metros arredondados de 10 em 10, mínimo 10 m', () => {
  assert.equal(fmtDistance(0), '10 m');
  assert.equal(fmtDistance(4), '10 m');
  assert.equal(fmtDistance(144), '140 m');
  assert.equal(fmtDistance(145), '150 m');
  assert.equal(fmtDistance(994), '990 m');
});

test('fmtDistance: km com 1 casa abaixo de 10 km, sem casa acima', () => {
  assert.equal(fmtDistance(1000), '1 km');
  assert.equal(fmtDistance(1250), '1,3 km');
  assert.equal(fmtDistance(9949), '9,9 km');
  assert.equal(fmtDistance(10000), '10 km');
  assert.equal(fmtDistance(123456), '123 km');
});

test('fmtDistance: sem valor → vazio', () => {
  assert.equal(fmtDistance(null), '');
  assert.equal(fmtDistance(undefined), '');
});

test('fmtDuration: minutos, horas e o mínimo de 1 min', () => {
  assert.equal(fmtDuration(0), '1 min');
  assert.equal(fmtDuration(29), '1 min');
  assert.equal(fmtDuration(90), '2 min');
  assert.equal(fmtDuration(59 * 60), '59 min');
  assert.equal(fmtDuration(3600), '1 h');
  assert.equal(fmtDuration(3600 + 5 * 60), '1 h 5 min');
  assert.equal(fmtDuration(89100), '24 h 45 min');
  assert.equal(fmtDuration(null), '');
});

test('fmtDurationShort: cabe em botões estreitos', () => {
  assert.equal(fmtDurationShort(7 * 60), '7 min');
  assert.equal(fmtDurationShort(3600), '1h');
  assert.equal(fmtDurationShort(3600 + 5 * 60), '1h05');
  assert.equal(fmtDurationShort(89100), '24h45');
  assert.equal(fmtDurationShort(47 * 3600 + 59 * 60), '47h59');
  assert.equal(fmtDurationShort(48 * 3600 + 30 * 60), '48h', 'a partir de 48 h só as horas');
  assert.equal(fmtDurationShort(null), '');
});

test('fmtDurationShort: 59,5 min arredonda para 1h (não "60 min")', () => {
  assert.equal(fmtDurationShort(59.5 * 60), '1h');
});

test('fmtCoords: latitude primeiro, 5 casas', () => {
  assert.equal(fmtCoords(-48.5, -27.123456), '-27.12346, -48.50000');
});

test('fmtArrival: horário HH:MM', () => {
  assert.match(fmtArrival(600), /^\d{2}:\d{2}$/);
});
