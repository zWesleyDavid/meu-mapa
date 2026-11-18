// Controlador principal: conecta mapa, busca, rotas, painel e navegação.
import { CONFIG } from './config.js';
import { $, bus, state, store, el, toast } from './core.js';
import { icon } from './icons.js';
import * as M from './map.js';
import { reverse } from './geocoder.js';
import { getDetails } from './details.js';
import { getRoutes } from './routing.js';
import { fromTiles, fromOverpass, mergePlaces, cancelNearby } from './places.js';
import { startLocation } from './location.js';
import { startCompass, requestCompass, compassActive } from './compass.js';
import { startNav, stopNav, isNavigating } from './nav.js';
import { fmtDuration } from './format.js';
import { setSheet, measurePeek } from './sheet.js';
import { startPick, cancelPick, setSearchText, addRecent, isSaved, toggleSaved } from './search-ui.js';
import { placeView, poiListView, routeTopView, directionsView } from './views.js';

const body = $('#sheet-body');
const routeTop = $('#route-top');
const ctx = $('#ctx-menu');

// ---------------- Tema ----------------
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let theme = store.get('theme', null) || (systemDark.matches ? 'dark' : 'light');

function applyTheme(t, updateMap = true) {
  theme = t;
  document.documentElement.dataset.theme = t;
  const btn = $('#theme-toggle');
  btn.innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
  btn.setAttribute('aria-label', t === 'dark' ? 'Usar tema claro' : 'Usar tema escuro');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t === 'dark' ? '#101317' : '#EEF2F5'));
  if (updateMap) {
    M.setTheme(t);
    // As camadas são recriadas no style.load com as cores do novo tema; redesenha o conteúdo.
    M.map.once('style.load', redrawMapContent);
  }
}
$('#theme-toggle').addEventListener('click', () => {
  const next = theme === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
});
systemDark.addEventListener('change', (e) => { if (!store.get('theme', null)) applyTheme(e.matches ? 'dark' : 'light'); });

applyTheme(theme, false);
M.initMap(theme);
state.profile = store.get('profile', CONFIG.routing.defaultProfile);

function redrawMapContent() {
  if (state.view === 'directions' && state.routes.length) M.drawRoutes(state.routes, state.selectedRoute);
  if (state.view === 'list') M.drawPois(listState.items || [], listState.category?.id);
}

// ---------------- Categorias ----------------
const chipsEl = $('#chips');
CONFIG.categories.forEach((c) => {
  chipsEl.append(el('button', { class: 'chip', 'data-cat': c.id, 'aria-pressed': 'false', onclick: () => openCategory(c), html: `${icon(c.icon)}<span>${c.label}</span>` }));
});
function markChip(id) {
  chipsEl.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === id)));
}

// ---------------- Telas ----------------
function mount(node, sheetState) {
  body.replaceChildren(node);
  requestAnimationFrame(() => setSheet(sheetState, { peek: measurePeek() }));
}

function setMode(mode) {
  if (mode !== 'place') delete body.dataset.place;
  document.body.classList.toggle('routing', mode === 'directions');
  routeTop.hidden = mode !== 'directions';
}

function showIdle() {
  state.view = 'idle';
  state.selectedPlace = null;
  setMode('idle');
  markChip(null);
  M.setMarker('place', null);
  M.drawPois([]);
  body.replaceChildren();
  setSheet('hidden');
}

// ----- Lugar -----
let placeInfo = null;
let infoToken = 0;
let placeDetails = null;
let detailsToken = 0;

function showPlace(place, { fly = false } = {}) {
  const changed = state.selectedPlace?.id !== place.id;
  state.view = 'place';
  state.selectedPlace = place;
  setMode('place');
  M.clearRoutes();
  M.setMarker('origin', null);
  M.setMarker('destination', null);
  M.setMarker('place', place);
  if (changed) { placeInfo = null; placeDetails = { loading: true }; loadPlaceInfo(place); loadPlaceDetails(place); }
  renderPlace();
  if (fly) M.flyToPlace(place);
}

function renderPlace() {
  const place = state.selectedPlace;
  if (!place) return;
  const firstOpen = body.dataset.place !== place.id;
  body.dataset.place = place.id;
  const node = placeView(place, {
    info: placeInfo,
    details: placeDetails,
    onCopy: async (text) => { try { await navigator.clipboard.writeText(text); toast('Endereço copiado'); } catch { toast('Não foi possível copiar.'); } },
    saved: isSaved(place),
    onClose: () => { setSearchText(''); listState.category ? showList() : showIdle(); },
    onDirections: () => openDirections(place),
    onSave: () => { const on = toggleSaved(place); toast(on ? 'Salvo' : 'Removido dos salvos'); renderPlace(); },
    onShare: () => sharePlace(place),
  });
  // Primeira vez: abre na metade para mostrar o começo dos detalhes; depois só atualiza o conteúdo.
  if (firstOpen) mount(node, 'half');
  else body.replaceChildren(node);
}

async function loadPlaceDetails(place) {
  const token = ++detailsToken;
  const d = await getDetails(place);
  if (token !== detailsToken || state.selectedPlace?.id !== place.id) return;
  placeDetails = d;
  if (state.view === 'place') renderPlace();
}

async function loadPlaceInfo(place) {
  const token = ++infoToken;
  if (!state.userPosition) { placeInfo = { reason: 'ative a localização' }; return; }
  placeInfo = { loading: true };
  try {
    const [r] = await getRoutes('car', state.userPosition, place, { alternatives: false, steps: false });
    if (token !== infoToken) return;
    placeInfo = { duration: r.duration, distance: r.distance };
  } catch {
    if (token !== infoToken) return;
    placeInfo = { reason: 'sem rota' };
  }
  if (state.view === 'place' && state.selectedPlace?.id === place.id) renderPlace();
}

// ----- Lista por categoria -----
const listState = { category: null, items: [], loading: false, error: null };

let catToken = 0;

function waitMapIdle(ms = 2500) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    M.map.once('idle', () => { clearTimeout(t); resolve(); });
  });
}

async function openCategory(cat) {
  if (listState.category?.id === cat.id && state.view === 'list') { listState.category = null; cancelNearby(); showIdle(); return; }
  const center = state.userPosition || (M.map.getZoom() > 11 ? M.map.getCenter() : null);
  if (!center) { toast('Aproxime o mapa ou ative a localização para buscar por perto.'); return; }
  const token = ++catToken;
  const c = { lng: center.lng, lat: center.lat };
  Object.assign(listState, { category: cat, items: [], loading: true, error: null });
  markChip(cat.id);
  showList();

  const alive = () => token === catToken && listState.category?.id === cat.id;
  const update = (items) => {
    if (!alive()) return;
    listState.items = mergePlaces(listState.items, items);
    M.drawPois(listState.items, listState.category?.id);
    if (state.view === 'list') showList({ keepSheet: true });
  };

  // 1) Instantâneo: pontos que já estão nos blocos do mapa (precisa de zoom de rua)
  const needZoom = M.map.getZoom() < 14.5;
  if (needZoom) M.map.flyTo({ center: [c.lng, c.lat], zoom: 15, padding: M.viewPadding(), duration: 600 });
  const tiles = (needZoom ? waitMapIdle() : Promise.resolve())
    .then(() => update(fromTiles(M.map, cat, c, CONFIG.categoryRadius)));

  // 2) Completo: OpenStreetMap via Overpass (amplia o raio se vier pouca coisa)
  const osm = (async () => {
    let items = await fromOverpass(cat, c, CONFIG.categoryRadius);
    update(items);
    if (alive() && listState.items.length < CONFIG.categoryMinResults) {
      items = await fromOverpass(cat, c, CONFIG.categoryRadiusMax);
      update(items);
    }
  })();

  const [, r2] = await Promise.allSettled([tiles, osm]);
  if (!alive()) return;
  listState.loading = false;
  if (r2.status === 'rejected' && r2.reason?.name !== 'AbortError' && !listState.items.length) {
    listState.error = 'Não consegui buscar agora. Tente de novo em instantes.';
  } else if (r2.status === 'rejected' && r2.reason?.name !== 'AbortError') {
    toast('Mostrando só os resultados do mapa: a busca completa não respondeu.');
  }
  if (state.view === 'list') showList({ keepSheet: true });
  if (listState.items.length) {
    M.fitCoords([[c.lng, c.lat], ...listState.items.slice(0, 10).map((p) => [p.lng, p.lat])], { maxZoom: 16 });
  }
}

function showList({ keepSheet = false } = {}) {
  state.view = 'list';
  setMode('list');
  M.setMarker('place', null);
  M.drawPois(listState.items, listState.category?.id);
  const node = poiListView({
    category: listState.category, items: listState.items, loading: listState.loading, error: listState.error,
    onPick: (p) => { addRecent(p); setSearchText(p.name); showPlace(p, { fly: true }); },
    onClose: () => { listState.category = null; cancelNearby(); showIdle(); },
  });
  if (keepSheet) body.replaceChildren(node);
  else mount(node, 'half');
}

// ----- Rotas -----
let routeError = null;
let routeLoading = false;
let modeTimes = {};
let showStepsList = false;

function showDirections({ sheetState } = {}) {
  state.view = 'directions';
  setMode('directions');
  routeTop.replaceChildren(...routeTopView({
    modeTimes,
    onBack: closeDirections,
    onPickOrigin: () => startPick('origin'),
    onPickDestination: () => startPick('destination'),
    onSwap: () => { [state.origin, state.destination] = [state.destination, state.origin]; updateEndpoints(); computeRoutes(); },
    onMode: (key) => { state.profile = key; store.set('profile', key); computeRoutes({ modeOnly: true }); },
  }));
  body.replaceChildren(directionsView({
    loading: routeLoading, error: routeError, showSteps: showStepsList,
    onSelectRoute: selectRoute,
    onStart: startNavigation,
    onToggleSteps: () => { showStepsList = !showStepsList; showDirections({ sheetState: showStepsList ? 'full' : 'half' }); },
    onStep: (s) => s.location && M.flyTo(s.location, 17),
  }));
  if (sheetState) requestAnimationFrame(() => setSheet(sheetState, { peek: measurePeek() }));
}

function openDirections(destination, { keepOrigin = false } = {}) {
  if (destination) state.destination = destination;
  if (!keepOrigin && !state.origin && state.userPosition) state.origin = { isUser: true };
  M.setMarker('place', null);
  M.drawPois([]);
  updateEndpoints();
  modeTimes = {};
  showStepsList = false;
  showDirections({ sheetState: 'half' });
  computeRoutes();
  if (!state.destination) startPick('destination');
  else if (!state.origin) startPick('origin');
}

function closeDirections() {
  state.routes = [];
  state.origin = null;
  M.clearRoutes();
  M.setMarker('origin', null);
  M.setMarker('destination', null);
  cancelPick();
  const back = state.destination;
  state.destination = null;
  if (back) { setSearchText(back.name); showPlace(back); } else { setSearchText(''); showIdle(); }
}

function updateEndpoints() {
  M.setMarker('origin', state.origin);
  M.setMarker('destination', state.destination);
}

let routeToken = 0;

function coordsOf(p) {
  if (!p) return null;
  if (p.isUser) return state.userPosition;
  return { lng: p.lng, lat: p.lat };
}

async function computeRoutes({ modeOnly = false } = {}) {
  const from = coordsOf(state.origin);
  const to = coordsOf(state.destination);
  state.routes = [];
  state.selectedRoute = 0;
  routeError = null;
  showStepsList = false;
  M.clearRoutes();
  if (!from || !to) { routeLoading = false; showDirections(); return; }
  if (!modeOnly) modeTimes = {};

  const token = ++routeToken;
  routeLoading = true;
  showDirections();

  if (!modeOnly) {
    Object.keys(CONFIG.routing.profiles).filter((k) => k !== state.profile).forEach((k) => {
      getRoutes(k, from, to, { alternatives: false, steps: false })
        .then((r) => { if (token === routeToken) { modeTimes[k] = r[0].duration; if (state.view === 'directions') showDirections(); } })
        .catch(() => {});
    });
  }

  try {
    const routes = await getRoutes(state.profile, from, to);
    if (token !== routeToken) return;
    routes.forEach((r) => { r.label = fmtDuration(r.duration); });
    state.routes = routes;
    modeTimes[state.profile] = routes[0].duration;
    routeLoading = false;
    M.drawRoutes(routes, 0);
    showDirections({ sheetState: 'half' });
    M.fitRoute(routes[0]);
  } catch (err) {
    if (token !== routeToken) return;
    routeLoading = false;
    routeError = err.message || 'Erro ao calcular a rota.';
    showDirections();
  }
}

function selectRoute(i) {
  if (!state.routes[i]) return;
  state.selectedRoute = i;
  M.drawRoutes(state.routes, i);
  showDirections();
}
bus.on('route:select', selectRoute);

// ----- Navegação -----
function startNavigation() {
  const route = state.routes[state.selectedRoute];
  if (!route) return;
  const simulate = !state.origin?.isUser;
  if (simulate) toast('Partida não é sua localização: mostrando uma simulação da viagem.', 3500);
  cancelPick();
  setSheet('hidden');
  startNav({
    route, profile: state.profile, destination: state.destination, simulate,
    onEnd: () => {
      M.map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      if (state.destination) { showDirections({ sheetState: 'half' }); M.drawRoutes(state.routes, state.selectedRoute); M.fitRoute(route); } else showIdle();
    },
  });
}

// ---------------- Eventos ----------------
bus.on('place:chosen', (place) => {
  if (state.pickTarget) {
    const target = state.pickTarget;
    cancelPick();
    state[target] = place.isUser ? { isUser: true } : place;
    setSearchText('');
    updateEndpoints();
    computeRoutes();
    if (target === 'destination' && !state.origin) startPick('origin');
    return;
  }
  listState.category = null;
  markChip(null);
  showPlace(place, { fly: true });
});

bus.on('search:cleared', () => { if (state.view === 'place') showIdle(); });

let flyOnFix = true;
bus.on('position', ({ position, first }) => {
  M.setUserDot(position);
  // Sem bússola: usa a direção do GPS quando estiver em movimento.
  if (!compassActive()) M.setUserHeading(position.speed > 1 && position.heading != null ? position.heading : null);
  if (first && flyOnFix && state.view === 'idle' && !isNavigating()) {
    M.map.flyTo({ center: [position.lng, position.lat], zoom: 15, duration: 1200 });
  }
  if (first) flyOnFix = false;
  if (isNavigating()) return;
  if (state.view === 'directions' && !state.origin) {
    state.origin = { isUser: true };
    computeRoutes();
  } else if (state.view === 'directions' && state.origin?.isUser && !state.routes.length && !routeLoading) {
    computeRoutes();
  } else if (first && state.view === 'place' && state.selectedPlace) {
    loadPlaceInfo(state.selectedPlace);
  }
});

bus.on('position:error', (e) => {
  toast(e?.code === 1 ? 'Permissão de localização negada.' : 'Não consegui obter sua localização.');
});

// Botões do mapa
bus.on('heading', (deg) => M.setUserHeading(deg));

$('#btn-locate').addEventListener('click', () => {
  requestCompass(); // iPhone pede permissão da bússola aqui (precisa de um toque)
  if (state.userPosition) M.map.flyTo({ center: [state.userPosition.lng, state.userPosition.lat], zoom: Math.max(M.map.getZoom(), 16), padding: M.viewPadding(), duration: 800 });
  else { flyOnFix = true; startLocation(); toast('Procurando sua localização…'); }
});
const compass = $('#btn-compass');
compass.addEventListener('click', () => M.resetNorth());
bus.on('map:rotate', (b) => { compass.hidden = Math.abs(b) < 1 && M.map.getPitch() < 1; compass.querySelector('svg').style.transform = `rotate(${-b}deg)`; });

// Toque longo / clique direito → menu de contexto
let ctxLngLat = null;
bus.on('map:longpress', ({ lngLat, point }) => {
  if (isNavigating()) return;
  ctxLngLat = lngLat;
  $('#ctx-title').textContent = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  ctx.hidden = false;
  const w = ctx.offsetWidth; const h = ctx.offsetHeight;
  ctx.style.left = `${Math.min(point.x, window.innerWidth - w - 8)}px`;
  ctx.style.top = `${Math.min(point.y, window.innerHeight - h - 8)}px`;
  navigator.vibrate?.(15);
});

function hideCtx() { ctx.hidden = true; }
bus.on('map:userpan', hideCtx);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); });

ctx.addEventListener('click', async (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action || !ctxLngLat) return;
  hideCtx();
  const { lng, lat } = ctxLngLat;
  const temp = { id: `pt:${lng.toFixed(6)},${lat.toFixed(6)}`, name: 'Ponto marcado', kind: 'Ponto no mapa', address: '', lng, lat };

  if (action === 'info') {
    showPlace({ ...temp, loading: true });
    const p = await enrich(temp);
    if (state.selectedPlace?.id === temp.id) { state.selectedPlace = p; renderPlace(); }
  } else if (action === 'to') {
    openDirections(temp);
    enrich(temp).then((p) => { if (state.destination?.id === temp.id) { state.destination = p; if (state.view === 'directions') showDirections(); } });
  } else if (action === 'from') {
    state.origin = temp;
    openDirections(null, { keepOrigin: true });
    enrich(temp).then((p) => { if (state.origin?.id === temp.id) { state.origin = p; if (state.view === 'directions') showDirections(); } });
  }
});

async function enrich(place) {
  try {
    const r = await reverse(place.lng, place.lat);
    if (!r) return { ...place, loading: false };
    return { ...place, name: r.name, address: r.address, kind: r.kind || place.kind, loading: false };
  } catch { return { ...place, loading: false }; }
}

// Cliques no mapa: pontos da lista, pontos de interesse do estilo
bus.on('map:click', (e) => {
  if (!ctx.hidden) { hideCtx(); return; }
  if (isNavigating() || state.view === 'directions') {
    const alt = M.map.queryRenderedFeatures(e.point, { layers: ['route-alt'] })[0];
    if (alt && !isNavigating()) selectRoute(alt.properties.idx);
    return;
  }
  const feats = M.map.queryRenderedFeatures(e.point);
  const listHit = feats.find((f) => f.layer.id === 'pois');
  if (listHit) {
    const p = listState.items[listHit.properties.i];
    if (p) { addRecent(p); setSearchText(p.name); showPlace(p, { fly: true }); }
    return;
  }
  const poi = feats.find((f) => f.layer.type === 'symbol' && f.properties?.name && f.geometry?.type === 'Point');
  if (!poi) return;
  const [lng, lat] = poi.geometry.coordinates;
  const place = {
    id: `poi:${poi.id ?? `${lng},${lat}`}`,
    name: poi.properties['name:pt'] || poi.properties.name,
    kind: '', address: '', lng, lat, loading: true,
  };
  listState.category = null; markChip(null);
  setSearchText(place.name);
  showPlace(place, { fly: true });
  enrich(place).then((p) => {
    if (state.selectedPlace?.id !== place.id) return;
    const full = { ...p, name: place.name };
    addRecent(full);
    state.selectedPlace = full;
    renderPlace();
  });
});

// ---------------- Utilidades ----------------
async function sharePlace(place) {
  const url = `https://www.openstreetmap.org/?mlat=${place.lat.toFixed(6)}&mlon=${place.lng.toFixed(6)}#map=17/${place.lat.toFixed(6)}/${place.lng.toFixed(6)}`;
  const text = `${place.name}${place.address ? ` — ${place.address}` : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title: place.name, text, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Link copiado!'); }
  catch { toast('Não foi possível compartilhar.'); }
}

// ---------------- Início ----------------
showIdle();

bus.on('map:ready', () => {
  if (window.isSecureContext) { startLocation(); startCompass(); }
  if (!store.get('hintShown', false)) {
    store.set('hintShown', true);
    setTimeout(() => toast('Dica: segure o dedo no mapa para traçar uma rota até ali.', 4500), 1500);
  }
});

if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposto para depuração no console e para futuras extensões.
window.meuMapa = { bus, state, map: () => M.map, stopNav };
