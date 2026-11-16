// Bússola do celular: para onde o aparelho está apontado (graus a partir do norte).
// Android/Chrome: evento deviceorientationabsolute. iPhone: webkitCompassHeading, com permissão.
import { bus } from './core.js';

let started = false;
let smoothed = null;
let pending = null;
let raf = 0;
let lastEmit = 0;

function screenAngle() {
  return (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
}

function onOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    heading = e.webkitCompassHeading;                       // iOS: já é relativo ao norte
  } else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') {
    heading = 360 - e.alpha;                                // Android: alpha anti-horário a partir do norte
  }
  if (heading == null) return;
  heading = (heading + screenAngle() + 360) % 360;

  // Suavização com tratamento da virada 359° → 0°
  if (smoothed == null) smoothed = heading;
  else {
    const diff = ((heading - smoothed + 540) % 360) - 180;
    smoothed = (smoothed + diff * 0.25 + 360) % 360;
  }
  pending = smoothed;
  if (!raf) raf = requestAnimationFrame(flush);
}

function flush() {
  raf = 0;
  const now = performance.now();
  if (now - lastEmit < 60) { raf = requestAnimationFrame(flush); return; } // ~15 atualizações/s
  lastEmit = now;
  bus.emit('heading', pending);
}

function listen() {
  if (started) return;
  started = true;
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrientation);
  else window.addEventListener('deviceorientation', onOrientation);
}

/** Começa sem pedir nada onde não é preciso permissão (Android). */
export function startCompass() {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // Chrome concede sem perguntar; o iPhone recusa sem um toque (aí o botão de localização pede).
    DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
    return;
  }
  listen();
}

/** iPhone: precisa ser chamado dentro de um toque do usuário. */
export async function requestCompass() {
  if (started || typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r === 'granted') listen();
    } catch { /* recusado */ }
  } else listen();
}

export function compassActive() { return started && smoothed != null; }
