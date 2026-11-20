// fetchJSON (js/core.js): tempo máximo, cancelamento e erros HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJSON } from '../js/core.js';
import { json, hangingFetch, withFetch } from './helpers.js';

test('devolve o JSON de uma resposta OK', async () => {
  await withFetch(() => json({ ok: 1 }), async () => {
    assert.deepEqual(await fetchJSON('https://x.test/a'), { ok: 1 });
  });
});

test('repassa método e corpo para o fetch', async () => {
  await withFetch(() => json({}), async (calls) => {
    await fetchJSON('https://x.test/a', { method: 'POST', body: 'q=1' });
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, 'q=1');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });
});

test('resposta de erro vira HttpError com o código', async () => {
  await withFetch(() => json({ message: 'x' }, 503), async () => {
    await assert.rejects(fetchJSON('https://x.test/a'), (err) => err.name === 'HttpError' && err.status === 503);
  });
});

test('servidor travado vira TimeoutError e a requisição é cancelada', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = hangingFetch(calls);
  try {
    const t0 = Date.now();
    await assert.rejects(fetchJSON('https://x.test/slow', { timeout: 30 }), (err) => err.name === 'TimeoutError' && /demorou/.test(err.message));
    assert.ok(Date.now() - t0 < 1000, 'não deve esperar além do tempo máximo');
    assert.equal(calls[0].init.signal.aborted, true, 'a requisição de rede deve ser cancelada');
  } finally {
    globalThis.fetch = original;
  }
});

test('o tempo máximo também cobre a leitura do corpo', async () => {
  // resposta chega, mas o corpo nunca termina
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => ({
    ok: true, status: 200,
    json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
  });
  try {
    await assert.rejects(fetchJSON('https://x.test/body', { timeout: 30 }), { name: 'TimeoutError' });
  } finally {
    globalThis.fetch = original;
  }
});

test('cancelamento por quem chamou vira AbortError (não TimeoutError)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = hangingFetch();
  try {
    const ctrl = new AbortController();
    const p = fetchJSON('https://x.test/a', { signal: ctrl.signal, timeout: 5000 });
    ctrl.abort();
    await assert.rejects(p, { name: 'AbortError' });
  } finally {
    globalThis.fetch = original;
  }
});

test('sinal já cancelado: nem chega a chamar o fetch', async () => {
  await withFetch(() => json({}), async (calls) => {
    const ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(fetchJSON('https://x.test/a', { signal: ctrl.signal }), { name: 'AbortError' });
    assert.equal(calls.length, 0);
  });
});

test('falha de conexão é repassada como veio (TypeError)', async () => {
  await withFetch(() => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(fetchJSON('https://x.test/a'), { name: 'TypeError' });
  });
});

test('JSON inválido é erro (não sucesso vazio)', async () => {
  await withFetch(() => new Response('<html>', { status: 200 }), async () => {
    await assert.rejects(fetchJSON('https://x.test/a'), SyntaxError);
  });
});

test('depois de terminar, cancelar o sinal externo não tem efeito', async () => {
  await withFetch(() => json({ a: 1 }), async (calls) => {
    const ctrl = new AbortController();
    const data = await fetchJSON('https://x.test/a', { signal: ctrl.signal });
    ctrl.abort();
    assert.deepEqual(data, { a: 1 });
    assert.equal(calls[0].init.signal.aborted, false, 'o ouvinte do sinal externo deve ter sido removido');
  });
});
