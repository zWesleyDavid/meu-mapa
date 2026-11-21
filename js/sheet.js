// Bottom sheet arrastável no celular; painel lateral fixo no desktop.
import { CONFIG } from './config.js';
import { $ } from './core.js';

const sheet = $('#sheet');
const body = $('#sheet-body');
const handle = $('#sheet-handle');
// layout em coluna: desktop ou celular deitado
const mq = window.matchMedia(CONFIG.layout.column);

let current = 'peek';
let peekPx = 150;
let contentPx = Infinity; // altura do conteúdo: "meio" não abre além dele (sem espaço vazio embaixo)

const isDesktop = () => mq.matches;
const sheetHeight = () => sheet.getBoundingClientRect().height;

function visibleFor(stateName) {
  const h = sheetHeight();
  switch (stateName) {
    case 'hidden': return 0;
    case 'peek': return Math.min(peekPx, h * 0.5);
    case 'half': return Math.min(window.innerHeight * 0.5, h, Math.max(contentPx, peekPx));
    case 'full': return h;
    default: return peekPx;
  }
}

function apply(visible, animate = true) {
  sheet.classList.toggle('dragging', !animate);
  const h = sheetHeight();
  if (isDesktop()) {
    sheet.style.transform = '';
    document.documentElement.style.setProperty('--sheet-h', '0px');
    return;
  }
  sheet.style.transform = `translateY(${Math.max(0, h - visible)}px)`;
  const ctrl = Math.min(visible, window.innerHeight * 0.5);
  document.documentElement.style.setProperty('--sheet-h', `${ctrl}px`);
}

export function setSheet(stateName, opts = {}) {
  if (opts.peek != null) peekPx = opts.peek;
  contentPx = measureContent();
  current = stateName;
  sheet.dataset.state = stateName;
  body.style.overflowY = isDesktop() || stateName === 'full' ? 'auto' : 'hidden';
  body.style.touchAction = isDesktop() || stateName === 'full' ? 'pan-y' : 'none';
  if (stateName !== 'full') body.scrollTop = 0;
  apply(visibleFor(stateName));
}

/** Mede a altura até o elemento marcado com data-peek-end para o estado "peek". */
export function measurePeek() {
  const end = body.querySelector('[data-peek-end]');
  if (!end) return 150;
  const top = sheet.getBoundingClientRect().top;
  const r = end.getBoundingClientRect();
  const handleH = handle.offsetHeight;
  // posição relativa ao topo do conteúdo, independente da translação atual
  const rel = r.bottom - top + (body.scrollTop || 0);
  return Math.ceil(Math.max(rel, handleH + 60) + 14);
}

/** Altura até o fim do conteúdo (mais a margem de baixo), independente da translação atual. */
function measureContent() {
  const last = body.lastElementChild;
  if (!last) return Infinity;
  const top = sheet.getBoundingClientRect().top;
  const rel = last.getBoundingClientRect().bottom - top + (body.scrollTop || 0);
  const padBottom = parseFloat(getComputedStyle(body).paddingBottom) || 0;
  return Math.ceil(rel + padBottom + 4);
}

// Conteúdo que muda depois de aberto (detalhes chegando, rotas calculadas): o "meio" acompanha.
let refit = 0;
new MutationObserver(() => {
  if (refit) return;
  refit = requestAnimationFrame(() => {
    refit = 0;
    if (drag || isDesktop()) return;
    contentPx = measureContent();
    if (current === 'half') apply(visibleFor('half'));
  });
}).observe(body, { childList: true, subtree: true, characterData: true });

// ---------------- Arrastar ----------------
let drag = null;
let suppressClickUntil = 0;

sheet.addEventListener('pointerdown', (e) => {
  if (isDesktop() || e.button > 0) return;
  const inBody = body.contains(e.target);
  if (inBody && current === 'full') return; // no modo cheio o conteúdo rola; arraste pela alça
  drag = { y0: e.clientY, v0: visibleFor(current), active: false, id: e.pointerId, t0: performance.now() };
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0;
  if (!drag.active) {
    if (Math.abs(dy) < 8) return;
    drag.active = true;
    try { sheet.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
  drag.last = { y: e.clientY, t: performance.now() };
  apply(Math.max(40, Math.min(sheetHeight(), drag.v0 - dy)), false);
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const wasActive = drag.active;
  const dy = e.clientY - drag.y0;
  const dt = performance.now() - drag.t0;
  const velocity = dy / Math.max(dt, 1); // px/ms (positivo = para baixo)
  const v = drag.v0 - dy;
  drag = null;
  if (!wasActive) return;
  suppressClickUntil = Date.now() + 350;

  const order = ['peek', 'half', 'full'];
  let target;
  if (Math.abs(velocity) > 0.6) {
    const idx = order.indexOf(current);
    target = order[Math.max(0, Math.min(order.length - 1, idx + (velocity < 0 ? 1 : -1)))];
  } else {
    target = order.reduce((best, s) => (Math.abs(visibleFor(s) - v) < Math.abs(visibleFor(best) - v) ? s : best), 'peek');
  }
  setSheet(target);
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// Evita que um "click" dispare depois de um arraste.
sheet.addEventListener('click', (e) => { if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);

handle.addEventListener('click', () => {
  setSheet(current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek');
});

mq.addEventListener('change', () => setSheet(current));
window.addEventListener('resize', () => apply(visibleFor(current), false));
