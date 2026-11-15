// Controlador principal: conecta mapa, busca, rotas e painel.
import { CONFIG } from './config.js';
import { $, bus, state, store, toast } from './core.js';
import { icon } from './icons.js';
import * as M from './map.js';
import { reverse } from './geocoder.js';
import { getRoutes } from './routing.js';
import { setSheet, measurePeek } from './sheet.js';
import { startPick, cancelPick, setSearchText, addRecent } from './search-ui.js';
import { welcomeView, placeView, directionsView } from './views.js';

const body = $('#sheet-body');
const ctx = $('#ctx-menu');

// ---------------- Tema ----------------
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let theme = store.get('theme', null) || (systemDark.matches ? 'dark' : 'light');

function applyTheme(t, updateMap = true) {
  theme = t;
  document.documentElement.dataset.theme = t;
  $('#theme-toggle').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
  if (updateMap) M.setTheme(t);
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

// ---------------- Telas ----------------
function mount(node, sheetState) {
  body.replaceChildren(node);
  requestAnimationFrame(() => setSheet(sheetState, { peek: measurePeek() }));
}

function showWelcome() {
  state.view = 'welcome';
  state.selectedPlace = null;
  M.setMarker('place', null);
  mount(welcomeView({ onDirections: () => openDirections(null), onLocate: () => M.locateMe() }), 'peek');
}

function showPlace(place, { loading = false } = {}) {
  state.view = 'place';
  state.selectedPlace = place;
  M.clearRoutes();
  M.setMarker('origin', null);
  M.setMarker('destination', null);
  M.setMarker('place', place);
  mount(placeView(place, {
    loading,
    onDirections: () => openDirections(place),
    onFromHere: () => { state.origin = place; openDirections(null, { keepOrigin: true }); },
    onCopy: () => copyPlace(place),
  }), 'peek');
}

let routeError = null;
let routeLoading = false;
let modeTimes = {};

function showDirections() {
  state.view = 'directions';
  const keepState = body.dataset.view === 'directions' ? undefined : 'half';
  body.dataset.view = 'directions';
  const node = directionsView({
    loading: routeLoading, error: routeError, modeTimes,
    onBack: closeDirections,
    onPickOrigin: () => startPick('origin'),
    onPickDestination: () => startPick('destination'),
    onSwap: () => { [state.origin, state.destination] = [state.destination, state.origin]; updateEndpoints(); computeRoutes(); },
    onMode: (key) => { state.profile = key; store.set('profile', key); computeRoutes({ modeOnly: true }); },
    onSelectRoute: selectRoute,
    onStep: (s) => s.location && M.flyTo(s.location, 17),
  });
  body.replaceChildren(node);
  if (keepState) requestAnimationFrame(() => setSheet(keepState, { peek: measurePeek() }));
}

function openDirections(destination, { keepOrigin = false } = {}) {
  if (destination) state.destination = destination;
  if (!keepOrigin && !state.origin && state.userPosition) state.origin = { isUser: true };
  M.setMarker('place', null);
  updateEndpoints();
  body.dataset.view = '';
  modeTimes = {};
  showDirections();
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
  body.dataset.view = '';
  cancelPick();
  const back = state.destination;
  state.destination = null;
  if (back) { setSearchText(back.name); showPlace(back); } else { setSearchText(''); showWelcome(); }
}

function updateEndpoints() {
  M.setMarker('origin', state.origin);
  M.setMarker('destination', state.destination);
}

// ---------------- Rotas ----------------
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
  M.clearRoutes();
  if (!from || !to) { routeLoading = false; showDirections(); return; }
  if (!modeOnly) modeTimes = {};

  const token = ++routeToken;
  routeLoading = true;
  showDirections();

  // Tempo dos outros modos (requisições leves, sem passos nem alternativas).
  if (!modeOnly) {
    Object.keys(CONFIG.routing.profiles).filter((k) => k !== state.profile).forEach((k) => {
      getRoutes(k, from, to, { alternatives: false, steps: false })
        .then((r) => { if (token === routeToken) { modeTimes[k] = r[0].duration; refreshModes(); } })
        .catch(() => {});
    });
  }

  try {
    const routes = await getRoutes(state.profile, from, to);
    if (token !== routeToken) return;
    state.routes = routes;
    modeTimes[state.profile] = routes[0].duration;
    routeLoading = false;
    M.drawRoutes(routes, 0);
    showDirections();
    M.fitRoute(routes[0]);
  } catch (err) {
    if (token !== routeToken) return;
    routeLoading = false;
    routeError = err.message || 'Erro ao calcular a rota.';
    showDirections();
  }
}

function refreshModes() {
  if (state.view === 'directions') showDirections();
}

function selectRoute(i) {
  if (!state.routes[i]) return;
  state.selectedRoute = i;
  M.drawRoutes(state.routes, i);
  showDirections();
}
bus.on('route:select', selectRoute);

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
  showPlace(place);
  M.flyToPlace(place);
});

bus.on('search:cleared', () => {
  if (state.view === 'place') showWelcome();
});

bus.on('position', ({ first }) => {
  if (first && state.view === 'directions' && !state.origin) {
    state.origin = { isUser: true };
    computeRoutes();
  } else if (state.view === 'directions' && state.origin?.isUser && !state.routes.length && !routeLoading) {
    computeRoutes();
  }
});

bus.on('position:error', (e) => {
  const msg = e?.code === 1 ? 'Permissão de localização negada.' : 'Não consegui obter sua localização.';
  toast(msg);
});

// Toque longo / clique direito → menu de contexto
let ctxLngLat = null;
bus.on('map:longpress', ({ lngLat, point }) => {
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
  const temp = { id: `pt:${lng.toFixed(6)},${lat.toFixed(6)}`, name: 'Ponto marcado', address: '', lng, lat };

  if (action === 'info') {
    showPlace(temp, { loading: true });
    const p = await enrich(temp);
    if (state.selectedPlace?.id === temp.id) showPlace(p);
  } else if (action === 'to') {
    openDirections(temp);
    enrich(temp).then((p) => { if (state.destination?.id === temp.id) { state.destination = p; showDirections(); } });
  } else if (action === 'from') {
    state.origin = temp;
    openDirections(null, { keepOrigin: true });
    enrich(temp).then((p) => { if (state.origin?.id === temp.id) { state.origin = p; showDirections(); } });
  }
});

async function enrich(place) {
  try {
    const r = await reverse(place.lng, place.lat);
    if (!r) return place;
    return { ...place, name: r.name, address: r.address, kind: r.kind };
  } catch { return place; }
}

// Clique em ponto de interesse do mapa
bus.on('map:click', (e) => {
  if (!ctx.hidden) { hideCtx(); return; }
  if (state.view === 'directions') return;
  const feats = M.map.queryRenderedFeatures(e.point);
  if (feats.some((f) => f.layer.id === 'route-alt')) return;
  const poi = feats.find((f) => f.layer.type === 'symbol' && f.properties?.name && f.geometry?.type === 'Point');
  if (!poi) return;
  const [lng, lat] = poi.geometry.coordinates;
  const place = {
    id: `poi:${poi.id ?? `${lng},${lat}`}`,
    name: poi.properties['name:pt'] || poi.properties.name,
    kind: '', address: '', lng, lat,
  };
  showPlace(place, { loading: true });
  M.flyTo([lng, lat], Math.max(M.map.getZoom(), 16));
  enrich(place).then((p) => {
    if (state.selectedPlace?.id !== place.id) return;
    const full = { ...p, name: place.name };
    addRecent(full);
    showPlace(full);
  });
});

// ---------------- Utilidades ----------------
async function copyPlace(place) {
  const url = `https://www.openstreetmap.org/?mlat=${place.lat.toFixed(6)}&mlon=${place.lng.toFixed(6)}#map=17/${place.lat.toFixed(6)}/${place.lng.toFixed(6)}`;
  const text = `${place.name}${place.address ? ` — ${place.address}` : ''}\n${url}`;
  try { await navigator.clipboard.writeText(text); toast('Copiado!'); }
  catch { toast('Não foi possível copiar.'); }
}

// ---------------- Início ----------------
showWelcome();

if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposto para depuração no console e para futuras extensões.
window.meuMapa = { bus, state, map: () => M.map };
