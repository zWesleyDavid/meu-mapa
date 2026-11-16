// Modo navegação: segue o GPS (ou uma simulação), mostra a próxima manobra, recalcula fora da rota e fala.
import { CONFIG } from './config.js';
import { $, bus, state, store, el, toast } from './core.js';
import { icon } from './icons.js';
import * as M from './map.js';
import { prepareRoute, snap, pointAt, distance } from './geo.js';
import { getRoutes } from './routing.js';
import { fmtDistance, fmtDuration, fmtArrival } from './format.js';
import { stepsList } from './views.js';
import { pauseLocationEvents } from './location.js';

const root = $('#nav');
const SKIP = new Set(['new name', 'notification']);

let nav = null; // sessão atual

export function isNavigating() { return !!nav; }

/**
 * Inicia a navegação.
 * @param {{ route, profile, destination, simulate?: boolean, onEnd: () => void }} opts
 */
export function startNav({ route, profile, destination, simulate = false, onEnd }) {
  stopNav(false);
  nav = {
    profile, destination, onEnd,
    prep: prepareRoute(route),
    hint: 0, offCount: 0, rerouting: false,
    following: true, muted: store.get('muted', false),
    spoken: new Map(), lastPos: null, arrived: false,
    sim: null, wakeLock: null, unsub: [],
  };
  document.body.classList.add('navigating');
  root.hidden = false;
  buildUI();
  M.drawRoutes([nav.prep], 0, { labels: false });
  requestWakeLock();
  primeSpeech();

  nav.unsub.push(bus.on('position', ({ position }) => { if (!nav.sim) onPosition(position); }));
  nav.unsub.push(bus.on('map:userpan', () => setFollowing(false)));

  if (simulate) startSimulation();
  else if (state.userPosition) onPosition(state.userPosition);
  else toast('Aguardando o sinal do GPS…');

  const first = nextStep(0);
  if (first) say(first.text, 'start');
}

export function stopNav(callEnd = true) {
  if (!nav) return;
  const { onEnd } = nav;
  nav.unsub.forEach((u) => u());
  stopSimulation();
  nav.wakeLock?.release?.().catch(() => {});
  try { speechSynthesis.cancel(); } catch { /* sem voz */ }
  nav = null;
  M.setPuck(null);
  document.body.classList.remove('navigating');
  root.hidden = true;
  root.replaceChildren();
  if (callEnd) onEnd?.();
}

// ---------------- UI ----------------
const ui = {};

function buildUI() {
  ui.icon = el('span', { html: icon('straight') });
  ui.street = el('div', { class: 'nav-street' }, '—');
  ui.dist = el('div', { class: 'nav-dist' }, '');
  ui.sign = el('div', { class: 'nav-sign' }, el('div', { class: 'nav-sign-inner' }, ui.icon, el('div', { style: 'min-width:0;flex:1' }, ui.street, ui.dist)));
  ui.stripIcon = el('span', { html: icon('left') });
  ui.stripText = el('span', { class: 'txt' }, '');
  ui.strip = el('div', { class: 'nav-strip' }, el('span', { class: 'lbl' }, 'Depois'), ui.stripIcon, ui.stripText);
  ui.top = el('div', { class: 'nav-top' }, ui.sign, ui.strip);

  ui.muteBtn = el('button', { class: 'fab', onclick: toggleMute });
  ui.overviewBtn = el('button', { class: 'fab', 'aria-label': 'Ver rota inteira', html: icon('overview'), onclick: overview });
  ui.side = el('div', { class: 'nav-side' }, ui.muteBtn, ui.overviewBtn);

  ui.recenter = el('button', { class: 'nav-recenter', hidden: true, onclick: () => setFollowing(true), html: `${icon('locate')}<span>Recentralizar</span>` });

  ui.speedVal = el('b', {}, '–');
  ui.speed = el('div', { class: 'nav-speed', 'aria-label': 'Velocidade atual' }, ui.speedVal, el('span', {}, 'km/h'));

  ui.etaMain = el('b', {}, '–');
  ui.etaSub = el('span', {}, '');
  ui.menuBtn = el('button', { class: 'btn square', 'aria-label': 'Mais opções', html: icon('more'), onclick: toggleMenu });
  ui.bottom = el('div', { class: 'nav-bottom' },
    el('div', { class: 'nav-eta' }, ui.etaMain, ui.etaSub),
    ui.menuBtn,
    el('button', { class: 'btn danger', onclick: () => stopNav(true) }, 'Encerrar'));

  ui.menu = null;
  ui.steps = null;
  root.replaceChildren(ui.top, ui.side, ui.recenter, ui.speed, ui.bottom);
  updateMuteBtn();
  requestAnimationFrame(() => document.documentElement.style.setProperty('--nav-top-h', `${ui.top.offsetHeight}px`));
}

function updateMuteBtn() {
  ui.muteBtn.innerHTML = icon(nav.muted ? 'mute' : 'volume');
  ui.muteBtn.setAttribute('aria-label', nav.muted ? 'Ativar voz' : 'Silenciar voz');
}

function toggleMute() {
  nav.muted = !nav.muted;
  store.set('muted', nav.muted);
  if (nav.muted) try { speechSynthesis.cancel(); } catch { /* ok */ }
  updateMuteBtn();
}

function setFollowing(v) {
  if (!nav) return;
  nav.following = v;
  ui.recenter.hidden = v;
  if (v && nav.lastPos) camera(nav.lastPos);
}

function overview() {
  setFollowing(false);
  M.map.easeTo({ pitch: 0, bearing: 0, duration: 300 });
  setTimeout(() => M.fitCoords(nav.prep.coords, { padding: M.navPadding(), pitch: 0, bearing: 0 }), 320);
}

function closePopovers() {
  ui.menu?.remove(); ui.menu = null;
  ui.steps?.remove(); ui.steps = null;
}

function toggleMenu() {
  if (ui.menu || ui.steps) { closePopovers(); return; }
  const item = (ico, label, fn) => el('button', { onclick: () => { closePopovers(); fn(); }, html: `${icon(ico)}<span>${label}</span>` });
  ui.menu = el('div', { class: 'nav-menu' },
    item('list', 'Passo a passo', showSteps),
    nav.sim ? item('close', 'Parar simulação', () => { stopSimulation(); toast('Simulação parada. Usando o GPS.'); })
      : item('play', 'Simular viagem', () => { startSimulation(); toast('Simulando a viagem pela rota'); }));
  root.append(ui.menu);
}

function showSteps() {
  const remaining = nav.prep.steps.filter((s) => s.at >= (nav.progress || 0) - 5);
  ui.steps = el('div', { class: 'nav-steps' }, stepsList(remaining, (s) => { closePopovers(); setFollowing(false); M.flyTo(s.location, 17); }));
  root.append(ui.steps);
}

// ---------------- Lógica ----------------
function nextStep(progress, after = 0) {
  const list = nav.prep.steps;
  let found = 0;
  for (let i = 1; i < list.length; i++) {
    const s = list[i];
    if (s.at <= progress + 3) continue;
    if (SKIP.has(s.type) || (s.type === 'continue' && (!s.modifier || s.modifier === 'straight'))) continue;
    if (found === after) return s;
    found++;
  }
  return null;
}

function onPosition(pos) {
  if (!nav || nav.arrived) return;
  const p = [pos.lng, pos.lat];
  const s = snap(nav.prep, p, nav.hint);
  if (!Number.isFinite(s.offset)) return;
  nav.hint = s.idx;

  // Fora da rota?
  const tolerance = CONFIG.nav.offRouteMeters + Math.min(pos.accuracy || 0, 40);
  if (s.offset > tolerance) {
    nav.offCount++;
    if (nav.offCount >= CONFIG.nav.offRouteFixes && !nav.rerouting) reroute(pos);
  } else nav.offCount = 0;

  const onRoute = s.offset <= tolerance;
  const progress = onRoute ? s.along : (nav.progress || 0);
  nav.progress = progress;
  const shown = onRoute && s.offset < 25 ? s.point : p;
  const heading = onRoute ? s.bearing : (pos.heading ?? nav.lastBearing ?? 0);
  nav.lastBearing = heading;
  nav.lastPos = { lngLat: shown, bearing: heading, speed: pos.speed };

  M.setPuck(shown, heading);
  if (onRoute) M.drawNavProgress(nav.prep.coords, s.idx, s.point);
  if (nav.following) camera(nav.lastPos);
  render(progress, pos.speed);

  const remaining = nav.prep.total - progress;
  if (remaining <= CONFIG.nav.arriveMeters || distance(p, [nav.destination.lng, nav.destination.lat]) <= CONFIG.nav.arriveMeters) arrive();
}

function camera({ lngLat, bearing: b, speed }) {
  const kmh = (speed || 0) * 3.6;
  const zoom = kmh > 80 ? 15.5 : kmh > 45 ? 16.3 : 17;
  M.followCamera(lngLat, b, zoom);
}

function render(progress, speed) {
  const step = nextStep(progress);
  const after = nextStep(progress, 1);
  const remaining = Math.max(0, nav.prep.total - progress);
  const remainingTime = nav.prep.duration * (remaining / (nav.prep.total || 1));

  if (step) {
    const d = step.at - progress;
    ui.icon.innerHTML = icon(step.icon);
    ui.street.textContent = step.type === 'arrive' ? (nav.destination.name || 'Destino') : (step.name || step.short);
    ui.street.classList.toggle('long', ui.street.textContent.length > 16);
    ui.dist.textContent = fmtDistance(d).toUpperCase();
    voice(step, d, speed);
  }
  if (after) {
    ui.strip.hidden = false;
    ui.sign.classList.remove('alone');
    ui.stripIcon.innerHTML = icon(after.icon);
    ui.stripText.textContent = after.type === 'arrive' ? 'Destino' : (after.name || after.short);
  } else {
    ui.strip.hidden = true;
    ui.sign.classList.add('alone');
  }
  ui.etaMain.textContent = fmtDuration(remainingTime);
  ui.etaSub.textContent = `${fmtDistance(remaining)} · chegada ${fmtArrival(remainingTime)}`;
  ui.speedVal.textContent = speed != null && speed >= 0 ? Math.round(speed * 3.6) : '–';
}

async function reroute(pos) {
  nav.rerouting = true;
  toast('Recalculando rota…');
  say('Recalculando rota', 'reroute');
  try {
    const [r] = await getRoutes(nav.profile, pos, nav.destination, { alternatives: false });
    if (!nav) return;
    nav.prep = prepareRoute(r);
    nav.hint = 0; nav.offCount = 0; nav.progress = 0; nav.spoken.clear();
    M.drawRoutes([nav.prep], 0, { labels: false });
    bus.emit('nav:rerouted', r);
  } catch {
    toast('Não consegui recalcular. Tentando de novo…');
  } finally {
    if (nav) setTimeout(() => { if (nav) nav.rerouting = false; }, 4000);
  }
}

function arrive() {
  if (nav.arrived) return;
  nav.arrived = true;
  stopSimulation();
  say(`Você chegou ao destino${nav.destination.name ? `, ${nav.destination.name}` : ''}`, 'arrive');
  ui.bottom.remove(); ui.speed.remove(); ui.side.remove(); closePopovers();
  ui.icon.innerHTML = icon('arrive');
  ui.street.textContent = nav.destination.name || 'Destino';
  ui.dist.textContent = 'CHEGOU';
  ui.strip.hidden = true; ui.sign.classList.add('alone');
  root.append(el('div', { class: 'nav-arrived' },
    el('div', { class: 'eyebrow' }, 'Você chegou'),
    el('h2', {}, nav.destination.name || 'Destino'),
    nav.destination.address ? el('p', {}, nav.destination.address) : el('p', {}, ' '),
    el('button', { class: 'btn primary big', style: 'width:100%', onclick: () => stopNav(true) }, 'Concluir')));
}

// ---------------- Voz ----------------
function primeSpeech() {
  // iOS só libera a voz depois de um gesto do usuário: este start vem do clique em "Iniciar".
  try { const u = new SpeechSynthesisUtterance(''); speechSynthesis.speak(u); } catch { /* sem voz */ }
}

function say(text, key) {
  if (!nav || nav.muted || !('speechSynthesis' in window)) return;
  if (key && nav.spoken.has(key)) return;
  if (key) nav.spoken.set(key, true);
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* sem voz */ }
}

function roundForVoice(m) {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toString().replace('.', ',')} quilômetros`;
  return `${Math.round(m / 50) * 50 || 50} metros`;
}

function voice(step, d, speed) {
  const id = `${step.at.toFixed(0)}`;
  const v = Math.max(speed || 0, 5);
  const far = Math.max(250, Math.min(800, v * 25));
  const near = Math.max(40, v * 5);
  const lower = step.text.charAt(0).toLowerCase() + step.text.slice(1);
  if (d <= near) say(step.text, `${id}:near`);
  else if (d <= far && d > near * 2) say(`Em ${roundForVoice(d)}, ${lower}`, `${id}:far`);
}

// ---------------- Tela sempre ligada ----------------
async function requestWakeLock() {
  try { nav.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* não suportado */ }
}
document.addEventListener('visibilitychange', () => {
  if (nav && document.visibilityState === 'visible') requestWakeLock();
});

// ---------------- Simulação ----------------
function startSimulation() {
  if (!nav) return;
  stopSimulation();
  const speed = CONFIG.routing.profiles[nav.profile]?.simSpeed || 12;
  let along = nav.progress || 0;
  pauseLocationEvents(true);
  nav.sim = setInterval(() => {
    if (!nav) return;
    along += speed;
    const { point, bearing: b } = pointAt(nav.prep, along);
    onPosition({ lng: point[0], lat: point[1], accuracy: 5, speed, heading: b });
  }, 1000);
}

function stopSimulation() {
  if (nav?.sim) { clearInterval(nav.sim); nav.sim = null; }
  pauseLocationEvents(false);
}
