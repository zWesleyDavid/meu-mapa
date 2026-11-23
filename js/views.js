// Renderização das telas. Funções de DOM: recebem dados e callbacks.
import { el, state } from './core.js';
import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { fmtDistance, fmtDuration, fmtDurationShort, fmtArrival, fmtCoords } from './format.js';
import { cleanSteps } from './routing.js';
import { openStatus, formatRanges, DAY_LABELS, todayIndex } from './hours.js';
import { maneuverIcon } from './maneuvers.js';

const h = (html) => ({ html });

// ---------------- Lugar ----------------
export function placeView(place, { info, details, saved, onClose, onDirections, onSave, onShare, onCopy, onRetry }) {
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

  const d = details && !details.loading ? details : null;
  const name = (d?.name && (place.name === place.kind || place.name === 'Ponto marcado')) ? d.name : place.name;
  const kind = d?.kind || place.kind || 'Local';
  const eyebrow = [kind, d?.brand].filter(Boolean).join(' · ');
  const address = d?.address || place.address;
  const status = d?.hours?.parsed ? openStatus(d.hours.parsed) : null;

  const head = el('div', { class: 'place-head' },
    el('div', { style: 'min-width:0' },
      el('div', { class: 'eyebrow' }, eyebrow),
      el('h1', { class: 'place-title' }, name),
      status ? el('div', { class: 'open-line' },
        el('span', { class: `open-dot ${status.open ? (status.soon ? 'soon' : 'ok') : 'bad'}` }),
        el('strong', { class: status.open ? (status.soon ? 'soon' : 'ok') : 'bad' }, status.open ? 'Aberto' : 'Fechado'),
        el('span', {}, ` · ${status.text.replace(/^Aberto 24 horas$/, '24 horas')}`)) : null,
      el('p', { class: 'place-sub' },
        address || (place.loading || details?.loading ? 'Buscando endereço…' : fmtCoords(place.lng, place.lat)))),
    el('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: onClose, ...h(icon('close')) }));

  return el('div', { class: 'place' },
    head,
    el('div', { class: 'stats' }, stats),
    el('div', { class: 'actions', 'data-peek-end': true },
      el('button', { class: 'btn primary', onclick: onDirections, ...h(`${icon('directions')}<span>Rotas</span>`) }),
      el('button', { class: 'btn square', 'aria-label': saved ? 'Remover dos salvos' : 'Salvar', 'aria-pressed': String(!!saved), onclick: onSave, ...h(icon('bookmark')) }),
      el('button', { class: 'btn square', 'aria-label': 'Compartilhar', onclick: onShare, ...h(icon('share')) })),
    detailsSection(place, details, { address, onCopy, onRetry }));
}

function infoRow(ico, main, sub, extra) {
  return el('div', { class: 'info-row' },
    el('span', { class: 'info-ico', ...h(icon(ico)) }),
    el('div', { class: 'info-main' }, main, sub ? el('div', { class: 'info-sub' }, sub) : null),
    extra || null);
}

const ext = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

function detailsSection(place, details, { address, onCopy, onRetry }) {
  const wrap = el('div', { class: 'details' });
  if (!details || details.loading) {
    wrap.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'Carregando informações…'));
    return wrap;
  }
  const d = details;
  const rows = [];

  if (d.hours) {
    if (d.hours.parsed) {
      const st = openStatus(d.hours.parsed);
      const today = todayIndex();
      const table = el('table', { class: 'hours-table' },
        DAY_LABELS.map((label, i) => el('tr', { class: i === today ? 'today' : '' },
          el('td', {}, label), el('td', {}, formatRanges(d.hours.parsed.week[i])))));
      rows.push(el('details', { class: 'info-row hours' },
        el('summary', {},
          el('span', { class: 'info-ico', ...h(icon('clock')) }),
          el('div', { class: 'info-main' },
            el('span', { class: st.open ? (st.soon ? 'soon' : 'ok') : 'bad' }, st.open ? 'Aberto' : 'Fechado'),
            ` · ${st.text}`,
            el('div', { class: 'info-sub' }, `Hoje: ${formatRanges(d.hours.parsed.week[today])}`)),
          el('span', { class: 'info-chev', ...h(icon('chevron')) })),
        table));
    } else {
      rows.push(infoRow('clock', 'Horário', d.hours.raw));
    }
  }

  if (address) {
    rows.push(infoRow('pin', address, d.level ? `Andar ${d.level}` : null,
      el('button', { class: 'icon-btn', 'aria-label': 'Copiar endereço', onclick: () => onCopy(address), ...h(icon('copy')) })));
  }
  if (d.phone) rows.push(infoRow('phone', el('a', { href: `tel:${d.phone.replace(/[^\d+]/g, '')}` }, d.phone)));
  if (d.whatsapp) rows.push(infoRow('chat', ext(`https://wa.me/${d.whatsapp}`, 'WhatsApp')));
  if (d.website) rows.push(infoRow('globe', ext(d.website, d.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))));
  if (d.instagram) rows.push(infoRow('instagram', ext(d.instagram.url, d.instagram.label)));
  if (d.facebook) rows.push(infoRow('facebook', ext(d.facebook.url, d.facebook.label)));
  if (d.email) rows.push(infoRow('mail', el('a', { href: `mailto:${d.email}` }, d.email)));

  if (rows.length) wrap.append(el('div', { class: 'info-list' }, rows));

  const chips = [...d.cuisine, ...d.fuels, ...d.features];
  if (chips.length) {
    wrap.append(el('div', { class: 'section-title' }, d.fuels.length ? 'Combustíveis e serviços' : 'Sobre o lugar'));
    wrap.append(el('div', { class: 'feature-chips' }, chips.map((c) => el('span', { class: 'feature-chip' }, c))));
  }
  if (d.description) wrap.append(el('p', { class: 'hint' }, d.description));

  if (!d.hours && !d.phone && !d.website && !d.instagram && !d.whatsapp) {
    wrap.append(el('p', { class: 'hint' }, d.lookupFailed
      ? 'Não consegui carregar as informações agora.'
      : 'Ainda não há horário ou contato cadastrados para este lugar.'));
    // servidor de dados fora do ar: dá para tentar de novo sem fechar o lugar
    if (d.lookupFailed && onRetry) wrap.append(el('button', { class: 'btn retry', onclick: onRetry }, 'Tentar de novo'));
  }

  const editUrl = d.osm?.editUrl || `https://www.openstreetmap.org/note/new#map=19/${place.lat.toFixed(6)}/${place.lng.toFixed(6)}`;
  wrap.append(el('div', { class: 'source-line' },
    el('span', {}, 'Dados: OpenStreetMap'),
    el('a', { href: editUrl, target: '_blank', rel: 'noopener noreferrer', ...h(`${icon('edit')}<span>${d.osm ? 'Sugerir edição' : 'Adicionar informações'}</span>`) })));
  wrap.append(el('div', { class: 'meta-line' }, fmtCoords(place.lng, place.lat)));
  return wrap;
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
      el('div', { class: 'eyebrow' }, items.length ? `Perto de você · ${items.length}` : 'Perto de você'),
      el('h2', { class: 'list-title' }, category.label)),
    el('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: onClose, ...h(icon('close')) }));
  head.setAttribute('data-peek-end', '');
  const wrap = el('div', {}, head);
  if (items.length) {
    wrap.append(el('ul', { class: 'poi-list' }, items.map((p) =>
      el('li', {}, el('button', { onclick: () => onPick(p) },
        el('div', { style: 'min-width:0' },
          el('div', { class: 'p-name' }, p.name),
          (p.kind !== category.kind || p.address)
            ? el('div', { class: 'p-sub' }, [p.kind !== category.kind ? p.kind : null, p.address].filter(Boolean).join(' · '))
            : null),
        el('span', { class: 'p-dist' }, fmtDistance(p.dist)))))));
  }
  if (loading) wrap.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), items.length ? 'Buscando mais lugares…' : 'Procurando…'));
  else if (error) wrap.append(el('div', { class: 'error' }, error));
  else if (!items.length) wrap.append(el('p', { class: 'hint' }, 'Nada encontrado por perto.'));
  return wrap;
}

// ---------------- Placa DE/PARA + modos ----------------
function fieldText(p, placeholder) {
  if (!p) return { text: placeholder, empty: true };
  return { text: p.isUser ? 'Sua localização' : p.name, empty: false };
}

// Setas sólidas da placa, no mesmo desenho das setas de manobra.
const SIGN_ICON = {
  back: '<path class="sh" d="M44 24H16"/><path class="hd" d="M3 24 18 11v26z"/>',
  swap: '<path class="sh" d="M15 44V16"/><path class="hd" d="M15 3 3 18h24z"/><path class="sh" d="M33 4v28"/><path class="hd" d="M33 45 21 30h24z"/>',
};
const signIcon = (name) => `<svg class="sign-ico" viewBox="0 0 48 48" aria-hidden="true">${SIGN_ICON[name]}</svg>`;

export function routeTopView({ onBack, onPickOrigin, onPickDestination, onPickStop, onAddStop, onRemoveStop, onSwap, onMode, modeTimes, maxStops = 3 }) {
  const o = fieldText(state.origin, 'Escolha a partida');
  const d = fieldText(state.destination, 'Escolha a chegada');
  const row = (label, f, onclick, extra) => el('div', { class: 'sign-row' },
    el('button', { class: 'sign-field', onclick, 'aria-label': `${label}: ${f.text}. Toque para alterar` },
      el('span', { class: 'sign-label' }, label),
      el('span', { class: `sign-value${f.empty ? ' empty' : ''}` }, f.text),
      el('span', { class: 'sign-edit', 'aria-hidden': 'true', ...h(icon('edit')) })),
    extra || null);
  const stops = (state.stops || []).map((p, i) => row(`${i + 1}ª`, fieldText(p, 'Escolha a parada'), () => onPickStop(i),
    el('button', { class: 'icon-btn sign-x', 'aria-label': `Remover parada ${i + 1}`, onclick: () => onRemoveStop(i), ...h(icon('close')) })));
  // com paradas, DE/PARA ganham o mesmo recuo do X para os campos ficarem alinhados
  const spacer = () => (stops.length ? el('span', { class: 'sign-x-sp', 'aria-hidden': 'true' }) : null);
  const canAdd = state.destination && (state.stops || []).length < maxStops;
  const sign = el('div', { class: `sign${stops.length ? ' has-stops' : ''}` },
    el('div', { class: 'sign-inner' },
      el('button', { class: 'icon-btn sign-btn', 'aria-label': 'Voltar', onclick: onBack, ...h(signIcon('back')) }),
      el('div', { class: 'sign-fields' },
        row('DE', o, onPickOrigin, spacer()),
        ...stops,
        row('PARA', d, onPickDestination, spacer()),
        canAdd ? el('button', { class: 'sign-add', onclick: onAddStop, ...h(`<span>+</span> Adicionar parada`) }) : null),
      el('button', { class: 'icon-btn sign-btn', 'aria-label': 'Inverter a viagem', title: 'Inverter a viagem', onclick: onSwap, ...h(signIcon('swap')) })));

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Meio de transporte' },
    Object.entries(CONFIG.routing.profiles).map(([key, p]) => {
      const t = modeTimes?.[key];
      return el('button', { 'aria-pressed': String(state.profile === key), 'aria-label': t != null ? `${p.label}: ${fmtDuration(t)}` : p.label, onclick: () => onMode(key) },
        el('span', h(icon(key))),
        el('span', { class: 'seg-t' }, t != null ? fmtDurationShort(t) : p.label));
    }));
  return [sign, seg];
}

// ---------------- Rotas (painel) ----------------
export function directionsView({ loading, error, showSteps, onSelectRoute, onStart, onToggleSteps, onStep }) {
  const stopName = (i) => { const p = state.stops?.[i]; return p ? (p.isUser ? 'Sua localização' : p.name) : ''; };
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
  if (showSteps) {
    const steps = state.routes[state.selectedRoute].steps.map((st) => (st.isStop ? { ...st, text: `Parada ${st.stopIndex + 1}: ${stopName(st.stopIndex)}` } : st));
    wrap.append(el('div', { class: 'section-title' }, 'Passo a passo'), stepsList(steps, onStep));
  }
  return wrap;
}

export function stepsList(steps, onStep) {
  return el('ol', { class: 'steps' },
    cleanSteps(steps).map((s) =>
      el('li', { onclick: () => onStep?.(s) },
        el('span', { class: 'st-ico', ...h(maneuverIcon(s.icon)) }),
        el('div', {},
          el('div', { class: 'st-text' }, s.text),
          s.distance > 0 && s.type !== 'arrive' ? el('div', { class: 'st-dist' }, fmtDistance(s.distance)) : null))));
}

// ---------------- Ajustes ----------------
// Miniaturas das opções "Plano" e "3D" nos ajustes
const MODE_ICON = {
  flat: '<svg viewBox="0 0 48 32"><rect width="48" height="32" rx="4" class="mi-bg"/><path d="M0 11h48M0 23h48M16 0v32M34 0v32" class="mi-road"/><path d="M25 32V11h23" class="mi-route"/></svg>',
  '3d': '<svg viewBox="0 0 48 32"><rect width="48" height="32" rx="4" class="mi-bg"/><path d="M4 26 18 20 44 26 30 32z" class="mi-road"/><path d="M8 22V10l6-3 6 3v12l-6 3z" class="mi-bld"/><path d="M8 10l6 3 6-3M14 13v12" class="mi-edge"/><path d="M27 23V6l5-2.5L37 6v17l-5 2.5z" class="mi-bld"/><path d="M27 6l5 2.5L37 6M32 8.5v17" class="mi-edge"/><path d="M22 30 40 26" class="mi-route"/></svg>',
};

export function settingsView({ values, version, onChange, onClose }) {
  const sw = (key, title, sub) => el('div', { class: 'set-row' },
    el('div', { class: 'set-txt' }, el('div', { class: 'set-title' }, title), sub ? el('div', { class: 'set-sub' }, sub) : null),
    el('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!values[key]), 'aria-label': title, onclick: () => onChange(key, !values[key]) },
      el('span', { class: 'knob' })));
  const themes = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];
  return el('div', { class: 'settings' },
    el('div', { class: 'list-head', 'data-peek-end': true },
      el('div', {}, el('div', { class: 'eyebrow' }, 'Ajustes'), el('h2', { class: 'list-title' }, 'Preferências')),
      el('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: onClose, ...h(icon('close')) })),
    el('div', { class: 'section-title' }, 'Aparência'),
    el('div', { class: 'set-row' },
      el('div', { class: 'set-txt' }, el('div', { class: 'set-title' }, 'Tema'), el('div', { class: 'set-sub' }, 'Automático segue o tema do celular')),
    ),
    el('div', { class: 'seg set-seg', role: 'group', 'aria-label': 'Tema' },
      themes.map(([v, label]) => el('button', { 'aria-pressed': String(values.theme === v), onclick: () => onChange('theme', v) }, label))),
    el('div', { class: 'section-title' }, 'Visual do mapa'),
    el('div', { class: 'mode-cards', role: 'group', 'aria-label': 'Visual do mapa' },
      [['flat', 'Plano', 'Como sempre foi', MODE_ICON.flat], ['3d', '3D', 'Prédios e relevo', MODE_ICON['3d']]].map(([v, label, sub, ico]) =>
        el('button', { class: 'mode-card', 'aria-pressed': String(values.mapMode === v), onclick: () => onChange('mapMode', v) },
          el('span', { class: 'mode-ico', 'aria-hidden': 'true', ...h(ico) }),
          el('span', { class: 'mode-txt' }, el('b', {}, label), el('small', {}, sub))))),
    values.lowBattery ? el('div', { class: 'set-note' }, 'Bateria fraca: mostrando o mapa plano até carregar.') : null,
    ...(values.mapMode === '3d' ? [
      el('div', { class: 'section-title' }, 'No modo 3D, mostrar'),
      sw('b3dBuildings', 'Prédios em 3D', 'Altura dos prédios do OpenStreetMap'),
      sw('b3dTerrain', 'Relevo', 'Morros e serras em 3D, com sombreamento (usa mais dados)'),
      sw('b3dSky', 'Céu no horizonte', 'Em vez do fundo vazio quando o mapa inclina'),
      sw('b3dDest', 'Destino em destaque', 'O prédio do lugar escolhido sobe na cor do app'),
      sw('b3dRoute', 'Rota em 3D', 'Parede de luz ao longo do caminho'),
      el('div', { class: 'set-row' }, el('div', { class: 'set-txt' }, el('div', { class: 'set-title' }, 'Seta na navegação'))),
      el('div', { class: 'seg set-seg', role: 'group', 'aria-label': 'Seta na navegação' },
        [['ball', 'Bolinha'], ['waze', 'A · Seta 3D'], ['ball3d', 'B · Bolinha 3D']].map(([v, label]) =>
          el('button', { 'aria-pressed': String(values.arrow === v), onclick: () => onChange('arrow', v) }, label))),
      sw('lowBatteryFlat', 'Plano com bateria fraca', 'Abaixo de 20% e fora da tomada, volta ao plano para economizar'),
    ] : []),
    el('div', { class: 'section-title' }, 'Navegação'),
    sw('abbreviate', 'Abreviar nomes na placa', 'R., Av., Serv., Dr.… Ex.: R. Dep. Otacílio Costa'),
    sw('voice', 'Instruções por voz', 'Fala as manobras e a faixa a usar'),
    sw('autoCollapse', 'Recolher o painel sozinho', 'Com o celular deitado, o painel de baixo recolhe após alguns segundos'),
    el('div', { class: 'meta-line' }, `Versão ${version} · dados © OpenStreetMap`));
}
