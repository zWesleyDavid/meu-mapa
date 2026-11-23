// Localização do usuário (GPS próprio, sem o controle do MapLibre, para termos controle total da câmera).
import { bus, state } from './core.js';

let watchId = null;
let paused = false; // a simulação de viagem pausa os eventos reais

export function startLocation() {
  if (watchId != null || !('geolocation' in navigator)) {
    if (!('geolocation' in navigator)) bus.emit('position:error', { code: 0 });
    return;
  }
  watchId = navigator.geolocation.watchPosition(onPos, onError, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 20000,
  });
}

function onError(e) {
  // Permissão negada encerra o acompanhamento: libera para o botão "Minha localização"
  // tentar de novo (antes ele só mostrava "Procurando sua localização…" para sempre).
  if (e?.code === 1 && watchId != null) {
    try { navigator.geolocation.clearWatch(watchId); } catch { /* ok */ }
    watchId = null;
  }
  bus.emit('position:error', e);
}

function onPos(p) {
  const pos = {
    lng: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy,
    speed: p.coords.speed, heading: p.coords.heading, time: p.timestamp,
  };
  const first = !state.userPosition;
  state.userPosition = pos;
  if (!paused) bus.emit('position', { position: pos, first });
}

export function pauseLocationEvents(v) { paused = v; }

