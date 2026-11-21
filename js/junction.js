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
// Desenhada num <canvas> com a perspectiva calculada aqui (e não com camadas 3D do navegador,
// que alguns celulares cortam quando são muito compridas). O "chão" usa coordenadas de plano:
// x de 0 a 640 (pista centrada em 320) e d = distância à frente do pé da tela, em px de plano.
// A cada quadro a nav.js chama junctionFrame() com a distância real e drawJunction() desenha.
export const SCENE = { W: 366, H: 250, PX_PER_M: 6, CAR_D: 72, FAR_D: 3000, NEAR_D: -60, DASH: 96, LOOP: 640, P: 420, EYE_Y: 58 };
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


/** Projeta um ponto do chão na tela (366 × 250). `turn` gira o chão em volta do pé da tela. */
export function projectPoint(x, d, turn = 0, mirrored = false) {
  const t = (turn * Math.PI) / 180;
  const dx = x - 320;
  const rx = dx * Math.cos(t) + d * Math.sin(t);
  const rd = d * Math.cos(t) - dx * Math.sin(t);
  const k = SCENE.P / (SCENE.P + rd);
  const sx = SCENE.W / 2 + rx * k;
  return [mirrored ? SCENE.W - sx : sx, SCENE.EYE_Y + (SCENE.H - SCENE.EYE_Y) * k];
}

const screenX = (geom, x) => projectPoint(x, SCENE.CAR_D, 0, geom.mirrored)[0];

/**
 * Estado de um quadro: `remaining` = metros até a manobra; `along` = metros percorridos na rota.
 * Tudo deriva da distância, então a cena anda na velocidade real (e para quando você para).
 */
export function junctionFrame(geom, remaining, along) {
  const r = Math.max(0, remaining);
  const s = SCENE.PX_PER_M;
  const lane = smooth((260 - r) / 120); // muda de faixa entre 260 m e 140 m
  const out = clamp01((40 - r) / 40);    // nos últimos 40 m a placa sai de cena
  return {
    split: SCENE.CAR_D + r * s,           // onde a alça se separa (d, em px de plano)
    phase: along * s,                     // quanto o chão já andou (tracejado e setas)
    ok: 0.18 * smooth((320 - r) / 100),
    bad: 0.45 * smooth((220 - r) / 120),
    puckX: screenX(geom, geom.centers[geom.start] + (geom.centers[geom.target] - geom.centers[geom.start]) * lane),
    gantryScale: 0.75 + 0.3 * clamp01((320 - r) / 280) + 0.25 * out,
    gantryOut: out,
    turn: geom.ramp ? -20 * smooth((35 - r) / 35) || 0 : 0,
    chip: r < 15 ? null : Math.round(r / 10) * 10,
  };
}

// --- formas do quadro (puro: dá para testar sem canvas) ---
const mod = (a, m) => ((a % m) + m) % m;

/** Recorta um polígono do chão no trecho visível (perto/longe), já girado. */
function clipAndProject(pts, turn, mirrored) {
  const t = (turn * Math.PI) / 180;
  const rot = pts.map(([x, d]) => { const dx = x - 320; return [dx * Math.cos(t) + d * Math.sin(t), d * Math.cos(t) - dx * Math.sin(t)]; });
  const clip = (poly, keep, cross) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) out.push(cross(a, b));
    }
    return out;
  };
  const at = (lim) => (a, b) => { const u = (lim - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * u, lim]; };
  let poly = clip(rot, (p) => p[1] >= SCENE.NEAR_D, at(SCENE.NEAR_D));
  poly = clip(poly, (p) => p[1] <= SCENE.FAR_D, at(SCENE.FAR_D));
  if (poly.length < 3) return null;
  return poly.map(([rx, rd]) => {
    const k = SCENE.P / (SCENE.P + rd);
    const sx = SCENE.W / 2 + rx * k;
    return [mirrored ? SCENE.W - sx : sx, SCENE.EYE_Y + (SCENE.H - SCENE.EYE_Y) * k];
  });
}

const rect = (x0, x1, d0, d1) => [[x0, d0], [x1, d0], [x1, d1], [x0, d1]];

/** Faixa de largura `w` ao longo de uma linha [(x, d), …] (cantos simples). */
function ribbon(line, w) {
  const left = [], right = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const tx = b[0] - a[0], td = b[1] - a[1];
    const L = Math.hypot(tx, td) || 1;
    const nx = (-td / L) * (w / 2), nd = (tx / L) * (w / 2);
    left.push([line[i][0] + nx, line[i][1] + nd]);
    right.push([line[i][0] - nx, line[i][1] - nd]);
  }
  return [...left, ...right.reverse()];
}

function bezier(p0, p1, p2, p3, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
  }
  return pts;
}

/**
 * Lista do que desenhar no quadro, em coordenadas de tela (366 × 250), na ordem:
 * polígonos { pts, fill, alpha } e setas { glyph, m: [a, b, c, d, e, f], color }.
 * `fill`/`color` são nomes de cores do tema (asphalt, mark, dim, route, case, black).
 */
export function sceneOps(geom, f) {
  const { N, w, x0, centers, lanes, g, ramp, mirrored } = geom;
  const T = f.turn;
  const polys = [];
  const add = (pts, fill, alpha = 1) => { const p = clipAndProject(pts, T, mirrored); if (p && alpha > 0.001) polys.push({ pts: p, fill, alpha }); };
  const gx0 = x0 + g * w, gx1 = x0 + N * w;
  const NEAR = SCENE.NEAR_D, FAR = SCENE.FAR_D;
  const sp = f.split;
  // pista que segue (todas as faixas, se não houver alça)
  add(rect(x0, gx0, NEAR, FAR), 'asphalt');
  lanes.forEach((l, i) => { if (i < g) add(rect(x0 + i * w, x0 + (i + 1) * w, NEAR, FAR), l.valid ? 'route' : 'black', l.valid ? f.ok : f.bad); });
  add(rect(x0 - 4, x0, NEAR, FAR), 'mark');
  if (!ramp) add(rect(gx1, gx1 + 4, NEAR, FAR), 'mark');
  // tracejado entre as faixas que seguem: anda com o chão
  const ph = mod(f.phase, SCENE.DASH);
  for (let i = 1; i < g; i++) {
    const x = x0 + i * w;
    for (let d = -ph - SCENE.DASH; d < FAR; d += SCENE.DASH) {
      if (d + 48 < NEAR) continue;
      add(rect(x - 2, x + 2, d, d + 48), 'mark');
    }
  }
  const arrows = [];
  const arrow = (glyph, xc, d, color) => {
    if (d < 0 || d > 2600) return;
    const O = projectPoint(xc - 17, d + 55, T, mirrored);
    const X = projectPoint(xc + 17, d + 55, T, mirrored);
    const Y = projectPoint(xc - 17, d - 55, T, mirrored);
    arrows.push({ glyph, color, m: [(X[0] - O[0]) / 48, (X[1] - O[1]) / 48, (Y[0] - O[0]) / 48, (Y[1] - O[1]) / 48, O[0], O[1]] });
  };
  // setas das faixas que seguem: repetem a cada 640 px de chão
  const pa = mod(f.phase, SCENE.LOOP);
  for (let k = -1; k < 6; k++) {
    const d = k * SCENE.LOOP + SCENE.LOOP - 180 - pa;
    lanes.forEach((l, i) => { if (i < g) arrow(l.glyph, centers[i], d, l.valid ? 'mark' : 'dim'); });
  }
  if (ramp) {
    const gc = (gx0 + gx1) / 2, rw = gx1 - gx0;
    const curve = bezier([gc, sp - 40], [gc, sp + 60], [gc + 36, sp + 170], [gc + 240, sp + 260]);
    const end = curve[curve.length - 1], prev = curve[curve.length - 2];
    const ext = [end[0] + (end[0] - prev[0]) * 12, end[1] + (end[1] - prev[1]) * 12]; // segue até sair do chão
    const rampLine = [...curve, ext];
    // faixas da alça + alça num polígono só: sem emenda visível entre a reta e a curva
    const lanesAndRamp = [[gx0, NEAR], ...ribbon(rampLine, rw), [gx1, NEAR]];
    add(ribbon(rampLine, rw + 8), 'mark');
    add(lanesAndRamp, 'asphalt');
    add(lanesAndRamp, 'route', f.ok);
    // tracejado da alça: preso à bifurcação
    for (let i = g; i < N; i++) {
      const x = x0 + i * w;
      for (let d = sp - 48; d + 48 > NEAR; d -= SCENE.DASH) add(rect(x - 2, x + 2, Math.max(d, NEAR), d + 48), 'mark');
      for (let k = 0; k < 6; k++) arrow(lanes[i].glyph, centers[i], sp - 355 - k * SCENE.LOOP, 'mark');
    }
    add(rect(gx1, gx1 + 4, NEAR, sp - 30), 'mark');
    add(rect(gx0 - 2, gx0 + 2, sp, FAR), 'mark');
    const route = [[gc, NEAR], ...curve.slice(0, -2)];
    add(ribbon(route, 30), 'case');
    add(ribbon(route, 20), 'route');
  } else {
    const v = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
    const gc = v.length ? (centers[v[0]] + centers[v[v.length - 1]]) / 2 : 320;
    add(rect(gc - 15, gc + 15, NEAR, FAR), 'case');
    add(rect(gc - 10, gc + 10, NEAR, FAR), 'route');
  }
  return { polys, arrows };
}

/** HTML da cena (canvas + bolinha, placa e distância por cima). */
export function junctionScene(info, step) {
  const [l1, l2] = signTexts(step);
  const side = info.branch === 'right' || info.branch === 'left' ? info.branch : 'center';
  const arrow = info.branch === 'right' ? 'slight-right' : info.branch === 'left' ? 'slight-left' : 'straight';
  return `<div class="jv" role="img" aria-label="${esc(info.hint)}">`
    + `<canvas class="jv-canvas" width="${SCENE.W}" height="${SCENE.H}"></canvas><div class="jv-fog"></div>`
    + `<div class="jv-puck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 17-7-4-7 4z"/></svg></div>`
    + `<div class="jv-gantry ${side}"><div class="jv-gantry-in"><svg class="lane-ico" viewBox="0 0 48 48" aria-hidden="true">${laneGlyph(arrow)}</svg>`
    + `<span><b>${esc(l1)}</b><small>${esc(l2)}</small></span></div></div>`
    + `<div class="jv-chip ${side === 'left' ? 'right' : 'left'}"></div>`
    + '</div>';
}

/** Caminhos da seta de faixa para o canvas (haste, ponta e se é espelhada). */
export function glyphPaths(name) {
  const base = MIRRORED[name] || (LANE_RIGHT[name] ? name : 'straight');
  const [sh, hd] = LANE_RIGHT[base];
  return { sh, hd, mirror: !!MIRRORED[name] };
}

const pathCache = new Map();
function paths2d(name) {
  if (!pathCache.has(name)) { const p = glyphPaths(name); pathCache.set(name, { sh: new Path2D(p.sh), hd: new Path2D(p.hd), mirror: p.mirror }); }
  return pathCache.get(name);
}

/**
 * Desenha um quadro: canvas + elementos por cima. `scale` = escala da cena na tela
 * (para o canvas ficar nítido) e `colors` = cores do tema já lidas do CSS.
 */
export function drawJunction(root, geom, f, { scale = 1, colors }) {
  const canvas = root.querySelector('.jv-canvas');
  const dpr = (window.devicePixelRatio || 1) * scale;
  const W = Math.round(SCENE.W * dpr), H = Math.round(SCENE.H * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, SCENE.W, SCENE.H);
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, SCENE.EYE_Y, SCENE.W, SCENE.H - SCENE.EYE_Y);
  const ops = sceneOps(geom, f);
  for (const p of ops.polys) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = colors[p.fill];
    ctx.beginPath();
    p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const a of ops.arrows) {
    const g = paths2d(a.glyph);
    const [m0, m1, m2, m3, m4, m5] = a.m;
    ctx.setTransform(dpr * m0, dpr * m1, dpr * m2, dpr * m3, dpr * m4, dpr * m5);
    if (g.mirror) ctx.transform(-1, 0, 0, 1, 48, 0);
    ctx.strokeStyle = ctx.fillStyle = colors[a.color];
    ctx.lineWidth = 7;
    ctx.stroke(g.sh);
    ctx.fill(g.hd);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // por cima: bolinha, placa e distância
  root.querySelector('.jv-puck').style.transform = `translateX(${(f.puckX - 15).toFixed(1)}px)`;
  const gEl = root.querySelector('.jv-gantry');
  const dir = gEl.classList.contains('left') ? -1 : gEl.classList.contains('right') ? 1 : 0;
  gEl.style.transform = `translate(${(dir * 70 * f.gantryOut).toFixed(1)}px, ${(-70 * f.gantryOut).toFixed(1)}px) scale(${f.gantryScale.toFixed(3)})`;
  gEl.style.opacity = (1 - f.gantryOut).toFixed(3);
  const chip = root.querySelector('.jv-chip');
  const text = f.chip == null ? '' : `${f.chip} m`;
  if (chip.textContent !== text) chip.textContent = text;
  chip.hidden = f.chip == null;
}

/** Cores do tema usadas pelo canvas (lidas uma vez por cena e quando o tema muda). */
export function junctionColors(el) {
  const cs = getComputedStyle(el);
  const v = (n, fb) => cs.getPropertyValue(`--${n}`).trim() || fb;
  return { bg: v('j-bg', '#0E1013'), ground: v('j-ground', '#0C0F13'), asphalt: v('j-asphalt', '#2A2F37'), mark: v('j-mark', '#E9EDF2'),
    dim: v('j-mark-dim', '#5B6472'), route: v('route', '#C8FF3D'), case: v('j-case', '#0B0D10'), black: '#000000' };
}
