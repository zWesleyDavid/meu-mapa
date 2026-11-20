// Horário de funcionamento do OpenStreetMap (js/hours.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours, openStatus, formatRanges, todayIndex } from '../js/hours.js';

// 2026-11-16 é segunda-feira. Horário local do processo (os testes não dependem do fuso).
const at = (day, hh, mm = 0) => new Date(2026, 10, 16 + day, hh, mm); // day: 0 = segunda

test('todayIndex: segunda = 0, domingo = 6', () => {
  assert.equal(todayIndex(at(0, 10)), 0);
  assert.equal(todayIndex(at(6, 10)), 6);
});

test('24/7', () => {
  const p = parseOpeningHours('24/7');
  assert.equal(p.always, true);
  assert.deepEqual(openStatus(p, at(2, 3)), { open: true, text: 'Aberto 24 horas', soon: false });
});

test('dias úteis + sábado + domingo fechado', () => {
  const p = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off');
  assert.deepEqual(p.week[0], [{ from: 480, to: 1080 }]);
  assert.deepEqual(p.week[5], [{ from: 480, to: 720 }]);
  assert.deepEqual(p.week[6], []);
  assert.equal(formatRanges(p.week[0]), '08:00–18:00');
  assert.equal(formatRanges(p.week[6]), 'Fechado');
});

test('vírgula no lugar de ponto e vírgula entre regras', () => {
  const p = parseOpeningHours('Mo-Fr 08:00-18:00, Sa 08:00-12:00');
  assert.deepEqual(p.week[5], [{ from: 480, to: 720 }]);
});

test('várias faixas no mesmo dia', () => {
  const p = parseOpeningHours('Mo-Sa 08:00-12:00,14:00-18:00');
  assert.equal(p.week[0].length, 2);
  assert.equal(openStatus(p, at(0, 13)).text, 'Abre às 14:00');
  assert.equal(openStatus(p, at(0, 13)).soon, true);
});

test('passa da meia-noite: aberto de madrugada pela faixa de ontem', () => {
  const p = parseOpeningHours('Mo-Su 18:00-02:00');
  assert.deepEqual(p.week[0], [{ from: 1080, to: 1560 }]);
  const s = openStatus(p, at(1, 1, 30)); // terça 01:30, faixa de segunda
  assert.equal(s.open, true);
  assert.equal(s.text, 'Fecha em breve · às 02:00');
});

test('status: aberto, fecha em breve, fechado com próxima abertura', () => {
  const p = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off');
  assert.deepEqual(openStatus(p, at(0, 10)), { open: true, soon: false, text: 'Fecha às 18:00' });
  assert.equal(openStatus(p, at(0, 17, 30)).text, 'Fecha em breve · às 18:00');
  assert.equal(openStatus(p, at(0, 7)).text, 'Abre às 08:00');
  assert.equal(openStatus(p, at(0, 19)).text, 'Abre amanhã às 08:00');
  assert.equal(openStatus(p, at(5, 13)).text, 'Abre seg às 08:00', 'sábado à tarde → segunda');
});

test('regra só de feriado é ignorada; sem dias = todos os dias', () => {
  const p = parseOpeningHours('08:00-20:00; PH off');
  assert.ok(p.week.every((d) => d.length === 1 && d[0].from === 480));
});

test('sempre fechado', () => {
  const p = parseOpeningHours('Mo-Su off');
  assert.equal(openStatus(p, at(0, 10)).text, 'Fechado');
});

test('formato não entendido → null (o app mostra o texto original)', () => {
  assert.equal(parseOpeningHours('sunrise-sunset'), null);
  assert.equal(parseOpeningHours('Mo-Fr 8h às 18h'), null);
  assert.equal(parseOpeningHours(''), null);
  assert.equal(parseOpeningHours(null), null);
  assert.equal(parseOpeningHours(42), null);
  assert.equal(openStatus(null), null);
});

test('formatRanges: 24 horas', () => {
  assert.equal(formatRanges([{ from: 0, to: 1440 }]), '24 horas');
});
