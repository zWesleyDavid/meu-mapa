// Faixas: análise dos dados de faixa do OSRM, barra de faixas e visão 2D esquemática da junção.
import { signName } from './settings.js';

const MIRROR = {
  left: 'right', right: 'left', 'slight-left': 'slight-right', 'slight-right': 'slight-left',
  'straight-left': 'straight-right', 'straight-right': 'straight-left', straight: 'straight', uturn: 'uturn',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function glyphFor(ind = []) {
  const has = (x) => ind.includes(x);
  const right = has('right') || has('sharp right');
  const left = has('left') || has('sharp left');
  if (has('straight') && (right || has('slight right'))) return 'straight-right';
  if (has('straight') && (left || has('slight left'))) return 'straight-left';
  if (has('uturn') && ind.length === 1) return 'uturn';
  if (right) return 'right';
  if (left) return 'left';
  if (has('slight right')) return 'slight-right';
  if (has('slight left')) return 'slight-left';
  return 'straight';
}

// Setas de faixa no desenho novo (o mesmo das setas de manobra): haste grossa + ponta sólida,
// numa grade de 48. `sh` = haste (traço), `hd` = ponta (preenchida). As da esquerda são espelhos.
const LANE_RIGHT = {
  straight: ['M24 47V17', 'M24 2 37 19H11z'],
  right: ['M15 47V27a11 11 0 0 1 11-11h5', 'M29 3 46 16 29 29z'],
  'slight-right': ['M17 47V31L28 20', 'M39 9 35.5 26.7 21.3 12.5z'],
  'straight-right': ['M17 47V17M17 39c0-8 4-12 12-12h3', 'M17 2 29 18H5zM31 18 44 27 31 36z'],
  uturn: ['M32 47V22a8 8 0 0 0-16 0v6', 'M7 27H25L16 42z'],
};
const MIRRORED = { left: 'right', 'slight-left': 'slight-right', 'straight-left': 'straight-right' };
export const LANE_GLYPHS = [...Object.keys(LANE_RIGHT), ...Object.keys(MIRRORED)];

/** Desenho (sem a tag svg) de uma seta de faixa, para usar dentro de outro SVG. */
export function laneGlyph(name) {
  const base = MIRRORED[name] || (LANE_RIGHT[name] ? name : 'straight');
  const [sh, hd] = LANE_RIGHT[base];
  const body = `<path class="sh" d="${sh}"/><path class="hd" d="${hd}"/>`;
  return MIRRORED[name] ? `<g transform="matrix(-1 0 0 1 48 0)">${body}</g>` : body;
}

export function laneIcon(name) {
  return `<svg class="lane-ico" viewBox="0 0 48 48" aria-hidden="true">${laneGlyph(name)}</svg>`;
}

/** → { lanes, valid, hint, branch, k } ou null quando não há escolha de faixa a fazer. */
export function analyzeLanes(step) {
  const raw = step?.lanes;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lanes = raw.map((l) => ({ glyph: glyphFor(l.indications), valid: !!l.valid }));
  const valid = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
  if (!valid.length || valid.length === lanes.length) return null;
  const N = lanes.length;
  const contiguous = valid[valid.length - 1] - valid[0] + 1 === valid.length;
  const atRight = contiguous && valid[valid.length - 1] === N - 1;
  const atLeft = contiguous && valid[0] === 0;
  const n = valid.length;
  let hint;
  if (atRight) hint = n === 1 ? 'Use a faixa da direita' : `Use as ${n} faixas da direita`;
  else if (atLeft) hint = n === 1 ? 'Use a faixa da esquerda' : `Use as ${n} faixas da esquerda`;
  else if (n === 1) hint = `Use a ${valid[0] + 1}ª faixa da esquerda`;
  else hint = 'Use as faixas do meio';

  const mod = step.modifier || '';
  let branch = 'straight';
  let k = 0;
  if (mod.includes('right') && atRight && valid[0] > 0) { branch = 'right'; k = valid[0]; }
  else if (mod.includes('left') && atLeft && valid[n - 1] < N - 1) { branch = 'left'; k = valid[n - 1] + 1; }
  return { lanes, valid, hint, branch, k, N };
}

/** Situação "confusa" o bastante para abrir a visão da junção. */
export function isComplex(info, step, after) {
  if (!info) return false;
  if (info.N >= 3) return true;
  // manobras coladas (ex.: sair e logo virar)
  return !!(after && step && after.at - step.at < 150);
}

function signTexts(step) {
  const dest = (step.destinations || '').split(/[:,]/).map((x) => x.trim()).filter(Boolean);
  const l1 = step.ref?.split(';')[0] || dest[0] || signName(step.name) || step.short || '';
  const rest = dest.filter((d) => d !== l1);
  const side = (step.modifier || '').includes('right') ? 'SAÍDA À DIREITA' : (step.modifier || '').includes('left') ? 'SAÍDA À ESQUERDA' : 'SIGA EM FRENTE';
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return [cut(l1.toUpperCase(), 17), cut((rest.join(' · ') || side).toUpperCase(), 24)];
}

// ---------------- Visão da junção em movimento ----------------
// Cena em 3D do próprio navegador (CSS): um "chão" de 640 × 3000 deitado com perspectiva.
// A estrutura é montada uma vez por manobra (junctionScene) e, a cada quadro, a nav.js aplica
// junctionFrame(): as faixas andam conforme a distância real percorrida (não por relógio).
export const SCENE = { W: 366, H: 250, PX_PER_M: 6, CAR_Y: 2928, SPLIT_Y: 420, DASH: 96, LOOP: 640 };
const V = (name) => `var(--${name})`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/**
 * Geometria da cena para a manobra. Saída à esquerda é desenhada como saída à direita com as
 * faixas em ordem inversa e espelhada na tela (mirrored). Faixas em coordenadas do chão.
 */
export function junctionGeometry(info) {
  const N = info.lanes.length;
  const mirrored = info.branch === 'left';
  const lanes = mirrored ? info.lanes.slice().reverse().map((l) => ({ ...l, glyph: MIRROR[l.glyph] || l.glyph })) : info.lanes.slice();
  const w = Math.min(76, 340 / N);
  const x0 = 320 - (N * w) / 2;
  const centers = lanes.map((_, i) => x0 + (i + 0.5) * w);
  // grupo que sai pela alça (só quando há saída para um lado)
  const g = info.branch === 'right' ? info.k : mirrored ? N - info.k : N;
  const valid = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
  // a bolinha começa numa faixa do meio e vai para a faixa certa mais próxima
  const start = Math.min(N - 1, Math.max(0, Math.round((N - 1) / 2)));
  const target = valid.length ? valid.reduce((a, b) => (Math.abs(b - start) < Math.abs(a - start) ? b : a)) : start;
  return { N, w, x0, centers, lanes, g, ramp: g < N, mirrored, start, target, branch: info.branch };
}

const PUCK_SCALE = 0.853; // largura do chão na altura da bolinha (perspectiva 420 px, ~72 px à frente)
const screenX = (geom, x) => { const sx = SCENE.W / 2 + (x - 320) * PUCK_SCALE; return geom.mirrored ? SCENE.W - sx : sx; };

/**
 * Estado de um quadro: `remaining` = metros até a manobra; `along` = metros percorridos na rota.
 * Tudo deriva da distância, então a cena anda na velocidade real (e para quando você para).
 */
export function junctionFrame(geom, remaining, along) {
  const r = Math.max(0, remaining);
  const s = SCENE.PX_PER_M;
  const mod = (a, m) => ((a % m) + m) % m;
  const lane = smooth((260 - r) / 120); // muda de faixa entre 260 m e 140 m
  const px = screenX(geom, geom.centers[geom.start] + (geom.centers[geom.target] - geom.centers[geom.start]) * lane);
  const out = clamp01((40 - r) / 40);    // nos últimos 40 m a placa sai de cena
  return {
    approachY: SCENE.CAR_Y - r * s - SCENE.SPLIT_Y,
    dashY: mod(along * s, SCENE.DASH),
    loopY: mod(along * s, SCENE.LOOP),
    ok: 0.18 * smooth((320 - r) / 100),
    bad: 0.45 * smooth((220 - r) / 120),
    puckX: px,
    gantryScale: 0.75 + 0.3 * clamp01((320 - r) / 280) + 0.25 * out,
    gantryOut: out,
    turn: geom.ramp ? -20 * smooth((35 - r) / 35) || 0 : 0,
    chip: r < 15 ? null : Math.round(r / 10) * 10,
  };
}

const glyphOnGround = (name, x, y, color) =>
  `<svg x="${(x - 17).toFixed(1)}" y="${y}" width="34" height="110" viewBox="0 0 48 48" preserveAspectRatio="none" class="lane-ico" style="color:${color}">${laneGlyph(name)}</svg>`;

/** HTML da cena (estrutura fixa da manobra). */
export function junctionScene(info, step) {
  const geom = junctionGeometry(info);
  const { N, w, x0, centers, lanes, g, ramp } = geom;
  const gx0 = x0 + g * w, gx1 = x0 + N * w;
  const Y = SCENE.SPLIT_Y;
  const st = (x) => `style="${x}"`;
  // chão fixo: faixas que seguem (ou todas, sem alça)
  const fixed = [];
  fixed.push(`<div class="jv-fill" style="left:${x0}px;width:${gx0 - x0}px;background:${V('j-asphalt')}"></div>`);
  lanes.forEach((l, i) => {
    if (i >= g) return;
    fixed.push(`<div class="jv-fill ${l.valid ? 'jv-ok' : 'jv-bad'}" style="left:${x0 + i * w}px;width:${w}px;background:${l.valid ? V('route') : '#000'}"></div>`);
  });
  fixed.push(`<div class="jv-fill" style="left:${x0 - 4}px;width:4px;background:${V('j-mark')}"></div>`);
  if (!ramp) fixed.push(`<div class="jv-fill" style="left:${gx1}px;width:4px;background:${V('j-mark')}"></div>`);
  for (let i = 1; i < g; i++) fixed.push(`<div class="jv-dash" style="left:${x0 + i * w - 2}px"></div>`);
  // setas das faixas que seguem: camada em laço
  const loop = [];
  for (let k = 0; k < 6; k++) lanes.forEach((l, i) => { if (i < g) loop.push(glyphOnGround(l.glyph, centers[i], k * SCENE.LOOP + 180, l.valid ? V('j-mark') : V('j-mark-dim'))); });
  // camada que se aproxima: grupo da alça, alça e fita da rota
  const ap = [];
  if (ramp) {
    const gc = (gx0 + gx1) / 2, rw = gx1 - gx0;
    const curve = `M${gc} ${Y + 40}C${gc} ${Y - 60} ${gc + 36} ${Y - 170} ${gc + 240} ${Y - 260}`;
    ap.push(`<rect x="${gx0}" y="${Y}" width="${rw}" height="3400" ${st(`fill:${V('j-asphalt')}`)}/>`);
    ap.push(`<rect class="jv-ok" x="${gx0}" y="${Y}" width="${rw}" height="3400" ${st(`fill:${V('route')}`)}/>`);
    ap.push(`<path d="${curve}" ${st(`fill:none;stroke:${V('j-mark')};stroke-width:${rw + 8}`)}/>`);
    ap.push(`<path d="${curve}" ${st(`fill:none;stroke:${V('j-asphalt')};stroke-width:${rw}`)}/>`);
    ap.push(`<path class="jv-ok" d="${curve}" ${st(`fill:none;stroke:${V('route')};stroke-width:${rw}`)}/>`);
    for (let i = g; i < N; i++) {
      const x = x0 + i * w;
      ap.push(`<line x1="${x}" y1="${Y}" x2="${x}" y2="3800" ${st(`stroke:${V('j-mark')};stroke-width:4;stroke-dasharray:48 48`)}/>`);
      for (let k = 0; k < 5; k++) ap.push(glyphOnGround(lanes[i].glyph, centers[i], Y + 300 + k * SCENE.LOOP, V('j-mark')));
    }
    ap.push(`<line x1="${gx1}" y1="${Y + 30}" x2="${gx1}" y2="3800" ${st(`stroke:${V('j-mark')};stroke-width:4`)}/>`);
    ap.push(`<line x1="${gx0}" y1="-3000" x2="${gx0}" y2="${Y}" ${st(`stroke:${V('j-mark')};stroke-width:4`)}/>`);
    const route = `M${gc} 3800L${gc} ${Y + 40}C${gc} ${Y - 60} ${gc + 36} ${Y - 170} ${gc + 220} ${Y - 250}`;
    ap.push(`<path d="${route}" ${st(`fill:none;stroke:${V('j-case')};stroke-width:30;stroke-linecap:round`)}/>`);
    ap.push(`<path d="${route}" ${st(`fill:none;stroke:${V('route')};stroke-width:20;stroke-linecap:round`)}/>`);
  } else {
    const v = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
    const gc = v.length ? (centers[v[0]] + centers[v[v.length - 1]]) / 2 : 320;
    fixed.push(`<div class="jv-fill" style="left:${gc - 15}px;width:30px;background:${V('j-case')}"></div>`);
    fixed.push(`<div class="jv-fill" style="left:${gc - 10}px;width:20px;background:${V('route')}"></div>`);
  }
  const [l1, l2] = signTexts(step);
  const side = info.branch === 'right' || info.branch === 'left' ? info.branch : 'center';
  const arrow = info.branch === 'right' ? 'slight-right' : info.branch === 'left' ? 'slight-left' : 'straight';
  return `<div class="jv" role="img" aria-label="${esc(info.hint)}">`
    + `<div class="jv-cam${geom.mirrored ? ' mirror' : ''}"><div class="jv-ground">${fixed.join('')}`
    + `<div class="jv-loop"><svg viewBox="0 0 640 3840" width="640" height="3840" aria-hidden="true">${loop.join('')}</svg></div>`
    + `<div class="jv-approach"><svg viewBox="0 0 640 3000" width="640" height="3000" aria-hidden="true">${ap.join('')}</svg></div>`
    + `</div></div><div class="jv-fog"></div>`
    + `<div class="jv-puck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 17-7-4-7 4z"/></svg></div>`
    + `<div class="jv-gantry ${side}"><div class="jv-gantry-in"><svg class="lane-ico" viewBox="0 0 48 48" aria-hidden="true">${laneGlyph(arrow)}</svg>`
    + `<span><b>${esc(l1)}</b><small>${esc(l2)}</small></span></div></div>`
    + `<div class="jv-chip ${side === 'left' ? 'right' : 'left'}"></div>`
    + '</div>';
}

/** Aplica um quadro na cena já montada (só transformações e opacidades: leve para 60 fps). */
export function applyJunctionFrame(root, f) {
  const q = (sel) => root.querySelector(sel);
  q('.jv-approach').style.transform = `translateY(${f.approachY.toFixed(1)}px)`;
  q('.jv-loop').style.transform = `translateY(${f.loopY.toFixed(1)}px)`;
  root.querySelectorAll('.jv-dash').forEach((d) => { d.style.backgroundPositionY = `${f.dashY.toFixed(1)}px`; });
  root.querySelectorAll('.jv-ok').forEach((e) => { e.style.opacity = f.ok.toFixed(3); });
  root.querySelectorAll('.jv-bad').forEach((e) => { e.style.opacity = f.bad.toFixed(3); });
  q('.jv-ground').style.transform = `rotateX(90deg) rotateZ(${f.turn.toFixed(2)}deg)`;
  q('.jv-puck').style.transform = `translateX(${(f.puckX - 15).toFixed(1)}px)`;
  const gEl = q('.jv-gantry');
  const dir = gEl.classList.contains('left') ? -1 : gEl.classList.contains('right') ? 1 : 0;
  gEl.style.transform = `translate(${(dir * 70 * f.gantryOut).toFixed(1)}px, ${(-70 * f.gantryOut).toFixed(1)}px) scale(${f.gantryScale.toFixed(3)})`;
  gEl.style.opacity = (1 - f.gantryOut).toFixed(3);
  const chip = q('.jv-chip');
  const text = f.chip == null ? '' : `${f.chip} m`;
  if (chip.textContent !== text) chip.textContent = text;
  chip.hidden = f.chip == null;
}
