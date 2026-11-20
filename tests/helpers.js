// Utilitários dos testes: substituem o fetch global por respostas controladas,
// para os testes nunca dependerem dos servidores reais (Photon, OSRM, Overpass).

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

/** fetch que nunca responde até ser cancelado (simula servidor travado). */
export function hangingFetch(calls = []) {
  return (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  };
}

/**
 * Troca o fetch global durante `fn` e restaura depois, mesmo se falhar.
 * `handler(url, init)` devolve uma Response (ou Promise dela); as chamadas ficam em `calls`.
 */
export async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

/** localStorage em memória (o Node não tem). */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  };
}
