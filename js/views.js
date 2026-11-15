// Renderização do conteúdo do painel. Funções puras de DOM: recebem dados e callbacks.
import { el, state } from './core.js';
import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { fmtDistance, fmtDuration, fmtArrival, fmtCoords } from './format.js';
import { cleanSteps } from './routing.js';

const btn = (label, ico, onclick, primary = false) =>
  el('button', { class: `btn${primary ? ' primary' : ''}`, onclick, html: `${icon(ico)}<span>${label}</span>` });

export function welcomeView({ onDirections, onLocate }) {
  return el('div', { class: 'welcome' },
    el('h2', {}, `Olá! Este é o ${CONFIG.appName}.`),
    el('p', {}, 'Busque um lugar, toque num ponto de interesse ou segure o dedo no mapa para escolher um local.'),
    el('div', { class: 'actions', 'data-peek-end': true },
      btn('Rotas', 'directions', onDirections, true),
      btn('Minha localização', 'start', onLocate)));
}

export function placeView(place, { onDirections, onFromHere, onCopy, loading }) {
  return el('div', {},
    el('h1', { class: 'place-title' }, place.name),
    place.kind ? el('p', { class: 'place-meta' }, place.kind) : null,
    el('p', { class: 'place-sub' }, loading ? 'Buscando endereço…' : (place.address || fmtCoords(place.lng, place.lat))),
    el('div', { class: 'actions', 'data-peek-end': true },
      btn('Rotas', 'directions', onDirections, true),
      btn('Sair daqui', 'start', onFromHere),
      btn('Copiar', 'copy', onCopy)),
    el('p', { class: 'place-meta' }, fmtCoords(place.lng, place.lat)));
}

function fieldLabel(p, placeholder) {
  if (!p) return { text: placeholder, empty: true };
  return { text: p.isUser ? 'Seu local' : p.name, empty: false };
}

export function directionsView(opts) {
  const { onBack, onPickOrigin, onPickDestination, onSwap, onMode, onSelectRoute, onStep,
    loading, error, modeTimes } = opts;
  const o = fieldLabel(state.origin, 'Escolha o ponto de partida');
  const d = fieldLabel(state.destination, 'Escolha o destino');

  const header = el('div', { style: 'display:flex;align-items:center;gap:6px;margin:0 0 8px -8px' },
    el('button', { class: 'icon-btn', 'aria-label': 'Voltar', onclick: onBack, html: icon('back') }),
    el('strong', { style: 'font-size:17px' }, 'Rotas'));

  const planner = el('div', { class: 'planner' },
    el('span', { class: 'dot a' }),
    el('button', { class: `field${o.empty ? ' empty' : ''}`, onclick: onPickOrigin }, o.text),
    el('button', { class: 'icon-btn swap', 'aria-label': 'Inverter', onclick: onSwap, html: icon('swap') }),
    el('span', { class: 'dot b' }),
    el('button', { class: `field${d.empty ? ' empty' : ''}`, onclick: onPickDestination }, d.text));

  const modes = el('div', { class: 'modes' },
    Object.entries(CONFIG.routing.profiles).map(([key, p]) =>
      el('button', { class: 'mode', 'aria-pressed': String(state.profile === key), onclick: () => onMode(key) },
        el('span', { html: icon(key) }),
        el('span', { class: 'mode-time' }, modeTimes?.[key] != null ? fmtDuration(modeTimes[key]) : p.label))));

  const wrap = el('div', {}, header, planner, modes);
  modes.setAttribute('data-peek-end', '');

  if (!state.origin || !state.destination) {
    wrap.append(el('p', { class: 'place-sub' },
      !state.origin ? 'Escolha de onde sair (ou ative sua localização).' : 'Escolha para onde ir.'));
    return wrap;
  }
  if (loading) {
    wrap.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'Calculando rotas…'));
    return wrap;
  }
  if (error) {
    wrap.append(el('div', { class: 'error' }, error));
    return wrap;
  }
  if (!state.routes.length) return wrap;

  const routes = el('div', { class: 'routes' },
    state.routes.map((r, i) =>
      el('button', { class: 'route-card', 'aria-pressed': String(i === state.selectedRoute), onclick: () => onSelectRoute(i) },
        el('div', {},
          el('div', { class: 'rt-time' }, fmtDuration(r.duration)),
          r.summary ? el('div', { class: 'rt-via' }, `via ${r.summary}`) : null),
        el('div', { style: 'text-align:right' },
          i === 0 ? el('div', { class: 'rt-badge' }, 'Mais rápida') : null,
          el('div', { class: 'rt-dist' }, fmtDistance(r.distance)),
          el('div', { class: 'rt-via' }, `chega ${fmtArrival(r.duration)}`)))));

  const route = state.routes[state.selectedRoute];
  const steps = el('ol', { class: 'steps' },
    cleanSteps(route.steps).map((s) =>
      el('li', { onclick: () => onStep(s) },
        el('span', { class: 'st-ico', html: icon(s.icon.name, s.icon.rot) }),
        el('div', {},
          el('div', { class: 'st-text' }, s.text),
          s.distance > 0 && s.type !== 'arrive' ? el('div', { class: 'st-dist' }, fmtDistance(s.distance)) : null))));

  wrap.append(routes, el('div', { class: 'section-title' }, 'Passo a passo'), steps);
  return wrap;
}
