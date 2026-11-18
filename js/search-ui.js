// Caixa de busca: autocompletar, histórico recente e navegação por teclado.
import { CONFIG } from './config.js';
import { $, bus, state, store, el, debounce } from './core.js';
import { search } from './geocoder.js';
import { icon } from './icons.js';
import { map } from './map.js';

const input = $('#search-input');
const list = $('#search-results');
const clearBtn = $('#search-clear');
const form = $('#search-form');

let items = [];
let active = -1;

const PLACEHOLDERS = {
  null: 'Buscar um lugar ou endereço',
  origin: 'Partida: busque ou toque no mapa',
  destination: 'Chegada: busque ou toque no mapa',
  stop: 'Parada: busque ou toque no mapa',
};
const placeholderFor = (target) => PLACEHOLDERS[String(target).startsWith('stop') ? 'stop' : target] || PLACEHOLDERS.null;

export function getRecents() { return store.get('recents', []); }
export function getSaved() { return store.get('saved', []); }
export function isSaved(place) { return getSaved().some((p) => p.id === place.id); }
export function toggleSaved(place) {
  const list = getSaved();
  const exists = list.some((p) => p.id === place.id);
  const next = exists ? list.filter((p) => p.id !== place.id)
    : [{ id: place.id, name: place.name, address: place.address, lng: place.lng, lat: place.lat, kind: place.kind }, ...list];
  store.set('saved', next.slice(0, 50));
  return !exists;
}

export function addRecent(place) {
  const rec = getRecents().filter((p) => p.id !== place.id);
  rec.unshift({ id: place.id, name: place.name, address: place.address, lng: place.lng, lat: place.lat, kind: place.kind, bbox: place.bbox });
  store.set('recents', rec.slice(0, CONFIG.recentLimit));
}

function near() {
  if (state.userPosition) return state.userPosition;
  if (!map) return null;
  const c = map.getCenter();
  return map.getZoom() > 8 ? { lng: c.lng, lat: c.lat } : null;
}

function render(places, { recents = false, empty = '' } = {}) {
  items = [];
  active = -1;
  list.innerHTML = '';
  if (state.pickTarget === 'origin' && state.userPosition) {
    list.append(row({ isUser: true, name: 'Sua localização', address: 'Usar o GPS' }, 'locate'));
  }
  if (recents) {
    const saved = getSaved();
    if (saved.length) {
      list.append(el('li', { class: 'r-section' }, 'Salvos'));
      saved.slice(0, 5).forEach((p) => list.append(row(p, 'bookmark')));
    }
    const rec = places.filter((p) => !saved.some((x) => x.id === p.id));
    if (rec.length) list.append(el('li', { class: 'r-section' }, 'Recentes'));
    rec.forEach((p) => list.append(row(p, 'history')));
  } else {
    places.forEach((p) => list.append(row(p, 'pin')));
  }
  if (!places.length && !recents && empty) list.append(el('li', { class: 'r-empty' }, empty));
  list.hidden = !list.children.length;
}

function row(p, ico) {
  items.push(p);
  return el('li', {
    role: 'option',
    onmousedown: (e) => e.preventDefault(), // não perde o foco antes do click
    onclick: () => choose(p.isUser ? { isUser: true, name: 'Sua localização', ...state.userPosition } : p),
  },
  el('span', { class: 'r-ico', html: icon(ico) }),
  el('div', { style: 'min-width:0' },
    el('div', { class: 'r-main' }, p.name),
    (p.kind || p.address) ? el('div', { class: 'r-sub' }, [p.kind, p.address].filter(Boolean).join(' · ')) : null));
}

function choose(place) {
  list.hidden = true;
  input.blur();
  if (!place.isUser) addRecent(place);
  input.value = state.pickTarget ? '' : place.name;
  clearBtn.hidden = !input.value;
  bus.emit('place:chosen', place);
}

const runSearch = debounce(async (q) => {
  try {
    const results = await search(q, near());
    if (input.value.trim() !== q) return; // resposta atrasada
    render(results, { empty: 'Nada encontrado' });
  } catch (err) {
    if (err.name === 'AbortError') return;
    render([], { empty: 'Não foi possível buscar agora. Verifique a conexão.' });
  }
}, CONFIG.geocoder.debounceMs);

input.addEventListener('input', () => {
  const q = input.value.trim();
  clearBtn.hidden = !input.value && !state.pickTarget;
  if (q.length < 2) { render(getRecents(), { recents: true }); return; }
  runSearch(q);
});

input.addEventListener('focus', () => {
  if (input.value.trim().length < 2) render(getRecents(), { recents: true });
  else list.hidden = !list.children.length;
});

input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));

input.addEventListener('keydown', (e) => {
  const rows = [...list.querySelectorAll('li[role="option"]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!rows.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows.forEach((r, i) => r.setAttribute('aria-selected', i === active));
    rows[active].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Escape') {
    input.blur();
    if (state.pickTarget) { cancelPick(); bus.emit('pick:cancel'); }
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const rows = [...list.querySelectorAll('li[role="option"]')];
  if (active >= 0 && rows[active]) rows[active].click();
  else if (rows[0]) rows[0].click();
});

clearBtn.addEventListener('click', () => {
  // escolhendo um ponto: o X cancela a escolha
  if (state.pickTarget && !input.value) { cancelPick(); input.blur(); bus.emit('pick:cancel'); return; }
  input.value = '';
  clearBtn.hidden = !state.pickTarget;
  bus.emit('search:cleared');
  input.focus();
});

export function startPick(target) {
  state.pickTarget = target;
  document.body.classList.add('picking');
  input.placeholder = placeholderFor(target);
  input.value = '';
  clearBtn.hidden = false; // vira "cancelar"
  input.focus();
}

export function cancelPick() {
  state.pickTarget = null;
  document.body.classList.remove('picking');
  input.placeholder = PLACEHOLDERS.null;
  clearBtn.hidden = !input.value;
}

export function setSearchText(text) {
  input.value = text || '';
  clearBtn.hidden = !input.value;
}
