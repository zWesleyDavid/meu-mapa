// Localização (js/location.js): depois de permissão negada, o botão pode tentar de novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const calls = { watch: 0, clear: 0 };
let fail = null; // função que o "navegador" chama com o erro
Object.defineProperty(globalThis.navigator, 'geolocation', {
  configurable: true,
  value: {
    watchPosition(ok, err) { calls.watch++; fail = err; return calls.watch; },
    clearWatch() { calls.clear++; },
  },
});

const { startLocation } = await import('../js/location.js');
const { bus } = await import('../js/core.js');

test('permissão negada: encerra o acompanhamento e um novo toque tenta de novo', () => {
  const errors = [];
  bus.on('position:error', (e) => errors.push(e.code));
  startLocation();
  assert.equal(calls.watch, 1);
  startLocation(); // ainda esperando: não abre outro
  assert.equal(calls.watch, 1);
  fail({ code: 1 });
  assert.deepEqual(errors, [1]);
  assert.equal(calls.clear, 1);
  startLocation(); // toque no botão depois do "negado"
  assert.equal(calls.watch, 2, 'pediu a localização de novo');
});

test('tempo esgotado (code 3) não derruba o acompanhamento', () => {
  const before = calls.watch;
  fail({ code: 3 });
  startLocation();
  assert.equal(calls.watch, before, 'continua o mesmo acompanhamento');
});
