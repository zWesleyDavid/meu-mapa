// Tudo que toca o MapLibre fica aqui.
import { CONFIG } from './config.js';
import { bus, state } from './core.js';
import { icon } from './icons.js';

/* global maplibregl */
export let map;
let geolocate;
let routeData = { type: 'FeatureCollection', features: [] };
const markers = { place: null, origin: null, destination: null };

export function initMap(theme) {
  map = new maplibregl.Map({
    container: 'map',
    style: CONFIG.styles[theme],
    center: CONFIG.initialView.center,
    zoom: CONFIG.initialView.zoom,
    attributionControl: { compact: true },
    dragRotate: true,
    pitchWithRotate: false,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10000 },
    trackUserLocation: true,
    showUserHeading: true,
    fitBoundsOptions: { maxZoom: 15 },
  });
  map.addControl(geolocate, 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  geolocate.on('geolocate', (e) => {
    const first = !state.userPosition;
    state.userPosition = { lng: e.coords.longitude, lat: e.coords.latitude, accuracy: e.coords.accuracy };
    bus.emit('position', { position: state.userPosition, first });
  });
  geolocate.on('error', (e) => bus.emit('position:error', e));

  map.on('style.load', addRouteLayers);
  map.on('load', () => {
    // Só pede a localização sozinho em contexto seguro (https ou localhost).
    if (window.isSecureContext && 'geolocation' in navigator) geolocate.trigger();
    bus.emit('map:ready', map);
  });

  setupPointerGestures();
  return map;
}

export function setTheme(theme) {
  if (!map) return;
  map.setStyle(CONFIG.styles[theme], { diff: false });
}

export function locateMe() { geolocate?.trigger(); }

// ---------------- Camadas de rota ----------------

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#1a73e8';
}

function addRouteLayers() {
  if (map.getSource('routes')) return;
  map.addSource('routes', { type: 'geojson', data: routeData });
  const alt = cssVar('--route-alt');
  const main = cssVar('--route');
  map.addLayer({
    id: 'route-alt', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': alt, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 16, 9], 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0b4fae', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 7, 16, 13] },
  });
  map.addLayer({
    id: 'route-main', type: 'line', source: 'routes', filter: ['==', ['get', 'selected'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': main, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4.5, 16, 9] },
  });
  if (!addRouteLayers.bound) {
    addRouteLayers.bound = true;
    map.on('click', 'route-alt', (e) => {
      e.preventDefault();
      bus.emit('route:select', e.features[0].properties.idx);
    });
    map.on('mouseenter', 'route-alt', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'route-alt', () => { map.getCanvas().style.cursor = ''; });
  }
}

export function drawRoutes(routes, selected) {
  routeData = {
    type: 'FeatureCollection',
    features: routes
      .map((r, idx) => ({ type: 'Feature', geometry: r.geometry, properties: { idx, selected: idx === selected } }))
      // a selecionada por último = desenhada por cima
      .sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected)),
  };
  map.getSource('routes')?.setData(routeData);
}

export function clearRoutes() { drawRoutes([], 0); }

// ---------------- Marcadores ----------------

function pinEl(color) {
  const d = document.createElement('div');
  d.className = 'pin';
  d.innerHTML = icon('pin').replace('<path', `<path fill="${color}"`);
  return d;
}

export function setMarker(kind, place) {
  markers[kind]?.remove();
  markers[kind] = null;
  if (!place || place.isUser) return;
  let element;
  if (kind === 'origin') { element = document.createElement('div'); element.className = 'pin-origin'; }
  else element = pinEl(kind === 'destination' ? '#d93025' : '#d93025');
  markers[kind] = new maplibregl.Marker({ element, anchor: kind === 'origin' ? 'center' : 'bottom' })
    .setLngLat([place.lng, place.lat])
    .addTo(map);
}

// ---------------- Câmera ----------------

/** Espaço ocupado pelo painel, para centralizar o conteúdo na área livre do mapa. */
export function viewPadding() {
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  if (desktop) return { top: 60, bottom: 60, left: 450, right: 70 };
  const sheetH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 0;
  return { top: 90, bottom: sheetH + 40, left: 40, right: 60 };
}

export function flyToPlace(place) {
  if (place.bbox) {
    const [w, s, e, n] = place.bbox;
    map.fitBounds([[w, s], [e, n]], { padding: viewPadding(), maxZoom: 17, duration: 900 });
  } else {
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 16), padding: viewPadding(), duration: 900 });
  }
}

export function fitRoute(route) {
  const coords = route.geometry.coordinates;
  const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(b, { padding: viewPadding(), duration: 900, maxZoom: 17 });
}

export function flyTo(lngLat, zoom = 17) {
  map.flyTo({ center: lngLat, zoom, padding: viewPadding(), duration: 700 });
}

// ---------------- Toque longo / clique direito ----------------

function setupPointerGestures() {
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  let lastFire = 0;
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
  map.on('movestart', (e) => { if (e.originalEvent) bus.emit('map:userpan'); });
  map.on('click', (e) => { if (!e.defaultPrevented) bus.emit('map:click', e); });
}
