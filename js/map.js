// Tudo que toca o MapLibre fica aqui.
import { CONFIG } from './config.js';
import { bus } from './core.js';
import { buildStyle, placeholderStyle } from './mapstyle.js';
import { provideIcon } from './mapicons.js';

/* global maplibregl */
export let map;
let routeData = { type: 'FeatureCollection', features: [] };
let poiData = { type: 'FeatureCollection', features: [] };
const markers = { place: null, origin: null, destination: null, user: null, puck: null };
let routeLabels = [];

export function initMap(theme) {
  map = new maplibregl.Map({
    container: 'map',
    style: placeholderStyle(theme),
    center: CONFIG.initialView.center,
    zoom: CONFIG.initialView.zoom,
    attributionControl: { compact: true },
    pitchWithRotate: false,
  });
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('styleimagemissing', (e) => provideIcon(map, e.id));
  map.on('style.load', addLayers);
  map.on('load', () => bus.emit('map:ready', map));
  setTheme(theme);
  map.on('rotate', () => bus.emit('map:rotate', map.getBearing()));
  setupPointerGestures();
  return map;
}

let styleToken = 0;
export async function setTheme(theme) {
  if (!map) return;
  const token = ++styleToken;
  try {
    const style = await buildStyle(theme);
    if (token !== styleToken) return;
    // Rede de segurança: se o estilo próprio não carregar, volta para o original.
    let loaded = false;
    const onLoad = () => { loaded = true; };
    map.once('style.load', onLoad);
    map.setStyle(style, { diff: false });
    setTimeout(() => {
      if (!loaded && token === styleToken) {
        console.warn('Estilo próprio não carregou; usando o original');
        map.setStyle(CONFIG.styles.base, { diff: false });
      }
    }, 6000);
  } catch (err) {
    console.warn('Estilo próprio indisponível, usando o original', err);
    if (token === styleToken) map.setStyle(CONFIG.styles.base, { diff: false });
  }
}

function cssVar(name, fallback = '#1a73e8') {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ---------------- Camadas ----------------
function addLayers() {
  if (map.getSource('routes')) return;
  const width = (a, b) => ['interpolate', ['linear'], ['zoom'], 8, a, 17, b];
  map.addSource('routes', { type: 'geojson', data: routeData });
  map.addSource('pois', { type: 'geojson', data: poiData });

  map.addLayer({
    id: 'route-alt-casing', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route-casing'), 'line-width': width(6, 13) },
  });
  map.addLayer({
    id: 'route-alt', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route-alt'), 'line-width': width(3.5, 8) },
  });
  // Trecho já percorrido na navegação
  map.addLayer({
    id: 'route-done-casing', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], 'done'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route-casing'), 'line-width': width(7, 14) },
  });
  map.addLayer({
    id: 'route-done', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], 'done'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route-done', '#8a94a3'), 'line-width': width(4.5, 9) },
  });
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route-casing'), 'line-width': width(8, 16) },
  });
  map.addLayer({
    id: 'route-main', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': cssVar('--route'), 'line-width': width(5, 10) },
  });
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  map.addLayer({
    id: 'pois', type: 'symbol', source: 'pois',
    layout: {
      'icon-image': ['concat', `mm-${theme}-`, ['get', 'cat']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 16, 1.1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  if (!addLayers.bound) {
    addLayers.bound = true;
    for (const id of ['route-alt', 'pois']) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
  }
}

export function drawRoutes(routes, selected, { labels = true } = {}) {
  routeData = {
    type: 'FeatureCollection',
    features: routes
      .map((r, idx) => ({ type: 'Feature', geometry: r.geometry, properties: { idx, selected: idx === selected } }))
      .sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected)),
  };
  map.getSource('routes')?.setData(routeData);
  routeLabels.forEach((m) => m.remove());
  routeLabels = [];
  if (!labels) return;
  routes.forEach((r, idx) => {
    const c = r.geometry.coordinates;
    // rótulo num ponto diferente para cada rota, para não se sobreporem
    const at = c[Math.floor(c.length * (idx === 0 ? 0.5 : 0.4))];
    const elx = document.createElement('button');
    elx.className = `route-label${idx === selected ? ' on' : ''}`;
    elx.textContent = r.label || '';
    elx.addEventListener('click', (e) => { e.stopPropagation(); bus.emit('route:select', idx); });
    routeLabels.push(new maplibregl.Marker({ element: elx, anchor: 'left', offset: [10, 0] }).setLngLat(at).addTo(map));
  });
}

export function clearRoutes() { drawRoutes([], 0); }

/** Navegação: pinta de cinza o que já foi percorrido e mantém o restante em destaque. */
export function drawNavProgress(coords, idx, point) {
  const done = coords.slice(0, idx + 1).concat([point]);
  const rest = [point].concat(coords.slice(idx + 1));
  const feats = [];
  if (done.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: done }, properties: { selected: 'done' } });
  if (rest.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: rest }, properties: { idx: 0, selected: true } });
  routeData = { type: 'FeatureCollection', features: feats };
  map.getSource('routes')?.setData(routeData);
}

export function drawPois(places, cat = 'default') {
  poiData = {
    type: 'FeatureCollection',
    features: places.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { i, cat } })),
  };
  map.getSource('pois')?.setData(poiData);
}

// ---------------- Marcadores ----------------
function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }

export function setMarker(kind, place) {
  markers[kind]?.remove();
  markers[kind] = null;
  if (!place || place.isUser) return;
  const element = div(kind === 'origin' ? 'origin-pin' : 'dest-pin');
  markers[kind] = new maplibregl.Marker({ element }).setLngLat([place.lng, place.lat]).addTo(map);
}

let stopMarkers = [];
/** Paradas numeradas no mapa. */
export function setStops(stops) {
  stopMarkers.forEach((m) => m.remove());
  stopMarkers = (stops || []).filter((p) => p && !p.isUser).map((p, i) => {
    const e = div('stop-pin');
    e.textContent = String(i + 1);
    return new maplibregl.Marker({ element: e }).setLngLat([p.lng, p.lat]).addTo(map);
  });
}

export function setUserDot(pos) {
  if (!pos) return;
  if (!markers.user) {
    const wrap = div('user-loc');
    wrap.append(div('user-cone'), div('user-dot'));
    markers.user = new maplibregl.Marker({ element: wrap, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([pos.lng, pos.lat]).addTo(map);
  } else markers.user.setLngLat([pos.lng, pos.lat]);
}

/** Direção para onde o celular aponta (graus a partir do norte) ou null para esconder o cone. */
export function setUserHeading(deg) {
  if (!markers.user) return;
  const e = markers.user.getElement();
  e.classList.toggle('has-heading', deg != null);
  if (deg != null) markers.user.setRotation(deg);
}

export function setPuck(lngLat, bearingDeg) {
  if (!lngLat) { markers.puck?.remove(); markers.puck = null; return; }
  if (!markers.puck) {
    const e = div('nav-puck');
    e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 19-8-4.5L4 21z"/></svg>';
    markers.puck = new maplibregl.Marker({ element: e, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(lngLat).addTo(map);
  }
  markers.puck.setLngLat(lngLat).setRotation(bearingDeg || 0);
}

// ---------------- Câmera ----------------
// layout em coluna (desktop ou celular deitado): painéis à esquerda, mapa à direita
const isColumn = () => window.matchMedia(CONFIG.layout.column).matches;
const isLandscapePhone = () => window.matchMedia(CONFIG.layout.landscapePhone).matches;
const colRight = (sel) => (document.querySelector(sel)?.getBoundingClientRect().right || 0);

/** Espaço ocupado pelos painéis, para centralizar o conteúdo na área livre. */
export function viewPadding() {
  if (isColumn()) {
    const left = Math.max(colRight('.panel-col'), 0) + 40;
    return isLandscapePhone() ? { top: 30, bottom: 30, left, right: 70 } : { top: 60, bottom: 60, left, right: 80 };
  }
  const sheetH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 0;
  const rt = document.getElementById('route-top');
  const top = document.body.classList.contains('routing') && rt ? rt.offsetHeight + 40 : 130;
  return { top, bottom: sheetH + 40, left: 40, right: 70 };
}

export function navPadding() {
  const topH = document.querySelector('.nav-top')?.offsetHeight || 170;
  if (isColumn()) {
    const left = colRight('.nav-top') + 30;
    // deitado: o carro fica mais embaixo para mostrar mais estrada à frente
    if (isLandscapePhone()) return { top: Math.round(window.innerHeight * 0.42), bottom: 16, left, right: 70 };
    return { top: 120, bottom: 60, left, right: 40 };
  }
  const top = Math.min(topH + 140, window.innerHeight * 0.62);
  return { top, bottom: 150, left: 30, right: 30 };
}

/**
 * Enquadra uma área. O MapLibre guarda a margem do último flyTo/easeTo e SOMA com a margem
 * passada aqui; se a soma passar do tamanho da tela, ele não faz nada. Por isso zeramos a
 * margem guardada antes e limitamos a nova ao tamanho da tela.
 */
function fitSafe(bounds, opts = {}) {
  const c = map.getContainer();
  const W = c.clientWidth || window.innerWidth;
  const H = c.clientHeight || window.innerHeight;
  const pad = { ...viewPadding(), ...(opts.padding || {}) };
  const fit = (a, b, total) => {
    const free = total - 80; // deixa pelo menos 80 px para o conteúdo
    if (a + b <= free) return [a, b];
    const k = free / (a + b);
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  [pad.top, pad.bottom] = fit(pad.top, pad.bottom, H);
  [pad.left, pad.right] = fit(pad.left, pad.right, W);
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(bounds, { duration: 900, maxZoom: 16, ...opts, padding: pad });
}

export function flyToPlace(place) {
  if (place.bbox) {
    const [w, s, e, n] = place.bbox;
    fitSafe([[w, s], [e, n]], { maxZoom: 17 });
  } else {
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 16), padding: viewPadding(), duration: 900 });
  }
}

export function fitCoords(coords, extra = {}) {
  if (!coords.length) return;
  const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  fitSafe(b, extra);
}

export function fitRoute(route, extra) { fitCoords(route.geometry.coordinates, extra); }

export function flyTo(lngLat, zoom = 17) {
  map.flyTo({ center: lngLat, zoom, padding: viewPadding(), duration: 700 });
}

export function followCamera(lngLat, bearingDeg, zoom, pitch = CONFIG.nav.pitch) {
  map.easeTo({
    center: lngLat, bearing: bearingDeg, pitch, zoom,
    padding: navPadding(), duration: 950, easing: (t) => t,
  });
}

export function resetNorth() { map.easeTo({ bearing: 0, pitch: 0, duration: 500 }); }

// ---------------- Toque longo / clique direito / cliques ----------------
function setupPointerGestures() {
  let timer = null;
  let start = null;
  let lastFire = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const fire = (e) => {
    if (Date.now() - lastFire < 600) return;
    lastFire = Date.now();
    bus.emit('map:longpress', { lngLat: e.lngLat, point: e.point });
  };

  map.on('contextmenu', (e) => { e.preventDefault?.(); fire(e); });
  map.on('touchstart', (e) => {
    if (e.originalEvent.touches.length !== 1) return cancel();
    start = e.point;
    timer = setTimeout(() => fire(e), 550);
  });
  map.on('touchmove', (e) => {
    if (start && (Math.abs(e.point.x - start.x) > 10 || Math.abs(e.point.y - start.y) > 10)) cancel();
  });
  map.on('touchend', cancel);
  map.on('touchcancel', cancel);
  map.on('dragstart', (e) => { if (e.originalEvent) bus.emit('map:userpan'); });
  map.on('click', (e) => bus.emit('map:click', e));
}
