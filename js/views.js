// Renderização das telas. Funções de DOM: recebem dados e callbacks.
import { el, state } from './core.js';
import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { fmtDistance, fmtDuration, fmtArrival, fmtCoords } from './format.js';
import { cleanSteps } from './routing.js';

const h = (html) => ({ html });

// ---------------- Lugar ----------------
export function placeView(place, { info, saved, onClose, onDirections, onSave, onShare }) {
  const stat = (v, unit, label) => el('div', { class: 'stat' },
    el('div', { class: 'stat-v' }, v, unit ? el('small', {}, ` ${unit}`) : null),
    el('div', { class: 'stat-l' }, label));

  let stats;
  if (info?.loading) stats = [stat('…', '', 'de carro'), stat('…', '', 'distância'), stat('…', '', 'chegada')];
  else if (info?.duration != null) {
    const [num, unit] = splitDuration(info.duration);
    const [dnum, dunit] = fmtDistance(info.distance).split(' ');
    stats = [stat(num, unit, 'de carro'), stat(dnum, dunit, 'distância'), stat(fmtArrival(info.duration), '', 'chegada')];
  } else {
    stats = [stat('—', '', 'de carro'), stat('—', '', 'distância'), stat('—', '', info?.reason || 'ative a localização')];
  }

  return el('div', { class: 'place' },
    el('div', { class: 'place-head' },
      el('div', { style: 'min-width:0' },
        el('div', { class: 'eyebrow' }, place.kind || 'Local'),
        el('h1', { class: 'place-title' }, place.name),
        el('p', { class: 'place-sub' }, place.loading ? 'Buscando endereço…' : (place.address || fmtCoords(place.lng, place.lat)))),
      el('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: onClose, ...h(icon('close')) })),
    el('div', { class: 'stats' }, stats),
    el('div', { class: 'actions', 'data-peek-end': true },
      el('button', { class: 'btn primary', onclick: onDirections, ...h(`${icon('directions')}<span>Rotas</span>`) }),
      el('button', { class: 'btn square', 'aria-label': saved ? 'Remover dos salvos' : 'Salvar', 'aria-pressed': String(!!saved), onclick: onSave, ...h(icon('bookmark')) }),
      el('button', { class: 'btn square', 'aria-label': 'Compartilhar', onclick: onShare, ...h(icon('share')) })),
    el('div', { class: 'meta-line' }, fmtCoords(place.lng, place.lat)));
}

function splitDuration(s) {
  const t = fmtDuration(s);           // "12 min" | "1 h 5 min"
  const m = t.match(/^(\d+) min$/);
  return m ? [m[1], 'min'] : [t, ''];
}

// ---------------- Lista de categoria ----------------
export function poiListView({ category, items, loading, error, onPick, onClose }) {
  const head = el('div', { class: 'list-head' },
    el('div', {},
      el('div', { class: 'eyebrow' }, 'Perto de você'),
      el('h2', { class: 'list-title' }, category.label)),
    el('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: onClose, ...h(icon('close')) }));
  head.setAttribute('data-peek-end', '');
  const wrap = el('div', {}, head);
  if (loading) wrap.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'Procurando…'));
  else if (error) wrap.append(el('div', { class: 'error' }, error));
  else if (!items.length) wrap.append(el('p', { class: 'hint' }, 'Nada encontrado num raio de 2 km.'));
  else {
    wrap.append(el('ul', { class: 'poi-list' }, items.map((p) =>
      el('li', {}, el('button', { onclick: () => onPick(p) },
        el('div', { style: 'min-width:0' },
          el('div', { class: 'p-name' }, p.name),
          p.address ? el('div', { class: 'p-sub' }, p.address) : null),
        el('span', { class: 'p-dist' }, fmtDistance(p.dist)))))));
  }
  return wrap;
}

// ---------------- Placa DE/PARA + modos ----------------
function fieldText(p, placeholder) {
  if (!p) return { text: placeholder, empty: true };
  return { text: p.isUser ? 'Sua localização' : p.name, empty: false };
}

export function routeTopView({ onBack, onPickOrigin, onPickDestination, onSwap, onMode, modeTimes }) {
  const o = fieldText(state.origin, 'Escolha a partida');
  const d = fieldText(state.destination, 'Escolha o destino');
  const sign = el('div', { class: 'sign' },
    el('div', { class: 'sign-inner' },
      el('button', { class: 'icon-btn', 'aria-label': 'Voltar', onclick: onBack, ...h(icon('back')) }),
      el('div', { class: 'sign-fields' },
        el('button', { class: 'sign-field', onclick: onPickOrigin, 'aria-label': `Partida: ${o.text}` },
          el('span', { class: 'sign-label' }, 'DE'),
          el('span', { class: `sign-value${o.empty ? ' empty' : ''}` }, o.text)),
        el('button', { class: 'sign-field', onclick: onPickDestination, 'aria-label': `Destino: ${d.text}` },
          el('span', { class: 'sign-label' }, 'PARA'),
          el('span', { class: `sign-value${d.empty ? ' empty' : ''}` }, d.text))),
      el('button', { class: 'icon-btn', 'aria-label': 'Inverter partida e destino', onclick: onSwap, ...h(icon('swap')) })));

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Meio de transporte' },
    Object.entries(CONFIG.routing.profiles).map(([key, p]) =>
      el('button', { 'aria-pressed': String(state.profile === key), 'aria-label': p.label, onclick: () => onMode(key) },
        el('span', h(icon(key))),
        modeTimes?.[key] != null ? fmtDuration(modeTimes[key]) : p.label)));
  return [sign, seg];
}

// ---------------- Rotas (painel) ----------------
export function directionsView({ loading, error, showSteps, onSelectRoute, onStart, onToggleSteps, onStep }) {
  const wrap = el('div', {});
  if (!state.origin || !state.destination) {
    wrap.append(el('p', { class: 'hint', 'data-peek-end': true },
      !state.origin ? 'Toque em DE para escolher de onde sair, ou ative sua localização.' : 'Toque em PARA para escolher o destino.'));
    return wrap;
  }
  if (loading) { wrap.append(el('div', { class: 'loading', 'data-peek-end': true }, el('span', { class: 'spinner' }), 'Calculando rotas…')); return wrap; }
  if (error) { wrap.append(el('div', { class: 'error', 'data-peek-end': true }, error)); return wrap; }
  if (!state.routes.length) return wrap;

  const routes = el('div', { class: 'routes' },
    state.routes.map((r, i) =>
      el('button', { class: 'route-card', 'aria-pressed': String(i === state.selectedRoute), onclick: () => onSelectRoute(i) },
        el('span', {},
          el('span', { class: 'rt-time' }, fmtDuration(r.duration)),
          el('span', { class: 'rt-sub' }, `${fmtDistance(r.distance)}${r.summary ? ` · via ${r.summary}` : ''}`)),
        el('span', { class: 'rt-right' },
          i === 0 && state.routes.length > 1 ? el('span', { class: 'badge' }, 'Mais rápida') : null,
          el('span', { class: 'rt-sub' }, `chega ${fmtArrival(r.duration)}`)))));

  const actions = el('div', { class: 'route-actions', 'data-peek-end': true },
    el('button', { class: 'btn primary big', onclick: onStart, ...h(`${icon('start')}<span>Iniciar</span>`) }),
    el('button', { class: 'btn big', 'aria-pressed': String(!!showSteps), onclick: onToggleSteps, ...h(`${icon('list')}<span>Passos</span>`) }));

  wrap.append(routes, actions);
  if (showSteps) wrap.append(el('div', { class: 'section-title' }, 'Passo a passo'), stepsList(state.routes[state.selectedRoute].steps, onStep));
  return wrap;
}

export function stepsList(steps, onStep) {
  return el('ol', { class: 'steps' },
    cleanSteps(steps).map((s) =>
      el('li', { onclick: () => onStep?.(s) },
        el('span', { class: 'st-ico', ...h(icon(s.icon)) }),
        el('div', {},
          el('div', { class: 'st-text' }, s.text),
          s.distance > 0 && s.type !== 'arrive' ? el('div', { class: 'st-dist' }, fmtDistance(s.distance)) : null))));
}
