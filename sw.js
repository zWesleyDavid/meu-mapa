// Service worker: guarda o "casco" do app para abrir rápido e funcionar como app instalado.
// Tiles, busca e rotas sempre vão para a rede (não são cacheados aqui).
const VERSION = 'v15';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/config.js', 'js/core.js', 'js/format.js', 'js/icons.js', 'js/geocoder.js',
  'js/routing.js', 'js/map.js', 'js/sheet.js', 'js/search-ui.js', 'js/views.js',
  'js/geo.js', 'js/location.js', 'js/places.js', 'js/nav.js', 'js/compass.js', 'js/mapstyle.js', 'js/hours.js', 'js/details.js', 'js/mapicons.js', 'js/junction.js', 'js/maneuvers.js', 'js/settings.js',
];
const LIBS = [
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
];

self.addEventListener('install', (e) => {
  // "reload" ignora o cache HTTP do navegador (o GitHub Pages manda guardar por 10 min)
  const reqs = [...SHELL.map((u) => new Request(u, { cache: 'reload' })), ...LIBS];
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin;
  const isLib = LIBS.includes(e.request.url);
  if (e.request.method !== 'GET' || (!isShell && !isLib)) return;

  // Rede primeiro para o próprio app, SEM usar o cache HTTP do navegador ("no-cache" revalida
  // com o servidor a cada vez, o que custa só uma resposta 304 quando nada mudou).
  // Cache do service worker só como reserva offline.
  e.respondWith(
    fetch(isShell ? new Request(e.request, { cache: 'no-cache' }) : e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
