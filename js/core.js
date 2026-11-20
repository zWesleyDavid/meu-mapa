// Núcleo: barramento de eventos + estado global + armazenamento local seguro.
// Novas funcionalidades devem se pendurar aqui (on/emit) em vez de acoplar módulos.

const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
  emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[bus] ${event}`, err); }
    });
  },
};

export const state = {
  userPosition: null,      // { lng, lat, accuracy }
  selectedPlace: null,     // Place
  origin: null,            // Place | { isUser: true }
  destination: null,       // Place
  stops: [],               // paradas intermediárias (até 3), na ordem da viagem
  profile: 'car',
  routes: [],              // rotas do perfil atual
  selectedRoute: 0,
  pickTarget: null,        // null | 'origin' | 'destination' | 'stop:<índice>' | 'stop:new'
  view: 'welcome',         // welcome (antes da 1ª tela) | idle | place | list | directions | settings
};

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`meumapa:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`meumapa:${key}`, JSON.stringify(value)); } catch { /* sem storage */ }
  },
};

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

const abortError = () => Object.assign(new Error('Cancelado'), { name: 'AbortError' });

/**
 * fetch + JSON com tempo máximo, cobrindo também a leitura da resposta.
 * Erros possíveis, pelo `name`:
 *  - AbortError: cancelado por quem chamou (via `signal`); em geral deve ser ignorado;
 *  - TimeoutError: o servidor não respondeu em `timeout` ms;
 *  - HttpError: resposta de erro (o código vem em `status`);
 *  - TypeError: sem conexão (vem do próprio fetch).
 */
export async function fetchJSON(url, { timeout = 10000, signal, ...init } = {}) {
  if (signal?.aborted) throw abortError();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { name: 'HttpError', status: res.status });
    return await res.json();
  } catch (err) {
    if (timedOut) throw Object.assign(new Error('O servidor demorou para responder.'), { name: 'TimeoutError' });
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
