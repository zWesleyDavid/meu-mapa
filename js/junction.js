// Faixas: análise dos dados de faixa do OSRM, barra de faixas e visão 2D esquemática da junção.

const ARROW = {
  straight: 'M12 21V5M6 11l6-6 6 6',
  left: 'M16 21v-7a5 5 0 0 0-5-5H5M9 5L5 9l4 4',
  right: 'M8 21v-7a5 5 0 0 1 5-5h6M15 5l4 4-4 4',
  'slight-right': 'M9 21v-8l7-7M11 6h5v5',
  'slight-left': 'M15 21v-8L8 6M13 6H8v5',
  'straight-right': 'M9 21V5M4.5 9.5L9 5l4.5 4.5M9 15l7-7M12 8h4v4',
  'straight-left': 'M15 21V5M10.5 9.5L15 5l4.5 4.5M15 15L8 8M12 8H8v4',
  uturn: 'M8 21V9a4 4 0 0 1 8 0v4M12 10l4 4 4-4',
};
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

export function laneIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW[name] || ARROW.straight}"/></svg>`;
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
  const l1 = step.ref?.split(';')[0] || dest[0] || step.name || step.short || '';
  const rest = dest.filter((d) => d !== l1);
  const side = (step.modifier || '').includes('right') ? 'SAÍDA À DIREITA' : (step.modifier || '').includes('left') ? 'SAÍDA À ESQUERDA' : 'SIGA EM FRENTE';
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return [cut(l1.toUpperCase(), 17), cut((rest.join(' · ') || side).toUpperCase(), 24)];
}

// ---------------- Visão 2D ----------------
const W = 366;
const H = 250;
const V = (name) => `var(--${name})`;

function groundArrow(name, cx, cy, size, ok) {
  const sc = size / 24;
  return `<g transform="translate(${(cx - size / 2).toFixed(1)} ${(cy - size * 0.36).toFixed(1)}) scale(${sc.toFixed(3)} ${(sc * 0.72).toFixed(3)})" `
    + `style="fill:none;stroke:${ok ? V('j-mark') : V('j-mark-dim')};stroke-width:3.4;stroke-linecap:square;stroke-linejoin:miter"><path d="${ARROW[name]}"/></g>`;
}

/** Desenha a pista com saída para a direita (a saída para a esquerda é o espelho disso). */
function drawRight(lanes, k, mirrored) {
  const N = lanes.length;
  const xs = Array.from({ length: N + 1 }, (_, i) => 10 + (i * (W - 20)) / N);
  const yTop = 58, ySplit = 160, yIn = 64, yOut = 128;
  const vx = xs[k];
  const lx = (xb, y) => xb + (vx - xb) * ((H - y) / (H + 220));
  const xr = lx(xs[N], ySplit);
  const o = [];
  const st = (s) => `style="${s}"`;
  // pista que segue reto
  o.push(`<path d="M${xs[0]} ${H}L${lx(xs[0], yTop).toFixed(1)} ${yTop}L${vx} ${yTop}L${vx} ${H}Z" ${st(`fill:${V('j-asphalt')}`)}/>`);
  // alça
  const ramp = `M${vx} ${H}L${vx} ${ySplit}C${vx + 6} ${ySplit - 45} ${vx + 60} ${ySplit - 80} ${W} ${yIn}L${W} ${yOut}C${xr + 20} ${yOut + 6} ${xr} ${ySplit - 14} ${xr.toFixed(1)} ${ySplit}L${xs[N]} ${H}Z`;
  o.push(`<path d="${ramp}" ${st(`fill:${V('j-asphalt')}`)}/>`);
  o.push(`<path d="${ramp}" ${st(`fill:${V('j-fill')}`)}/>`);
  // bordas
  const line = (d, dash) => `<path d="${d}" ${st(`fill:none;stroke:${V('j-mark')};stroke-width:3${dash ? ';stroke-dasharray:16 14' : ''}`)}/>`;
  o.push(line(`M${xs[0]} ${H}L${lx(xs[0], yTop).toFixed(1)} ${yTop}`));
  o.push(line(`M${vx} ${ySplit - 2}L${vx} ${yTop}`));
  o.push(line(`M${vx} ${ySplit}C${vx + 6} ${ySplit - 45} ${vx + 60} ${ySplit - 80} ${W} ${yIn}`));
  o.push(line(`M${xs[N]} ${H}L${xr.toFixed(1)} ${ySplit}C${xr} ${ySplit - 14} ${xr + 20} ${yOut + 6} ${W} ${yOut}`));
  // divisórias
  for (let i = 1; i < k; i++) o.push(line(`M${xs[i]} ${H}L${lx(xs[i], yTop).toFixed(1)} ${yTop}`, true));
  o.push(line(`M${vx} ${H}L${vx} ${ySplit}`, true));
  for (let j = k + 1; j < N; j++) {
    const xm = lx(xs[j], ySplit);
    const yEnd = yIn + ((yOut - yIn) * (j - k)) / (N - k);
    o.push(line(`M${xs[j]} ${H}L${xm.toFixed(1)} ${ySplit}C${xm + 4} ${ySplit - 40} ${xm + 40} ${yEnd + 12} ${W} ${yEnd}`, true));
  }
  // setas no chão
  lanes.forEach((l, i) => {
    const cb = (xs[i] + xs[i + 1]) / 2;
    const g = mirrored ? MIRROR[l.glyph] : l.glyph;
    [[H - 50, 38], [H - 88, 27]].forEach(([y, sz]) => o.push(groundArrow(g, lx(cb, y), y, sz * Math.min(1, 4 / N + 0.2), l.valid)));
  });
  // fita do caminho certo
  const gb = (xs[k] + xs[N]) / 2;
  const gm = lx(gb, ySplit);
  const ge = (yIn + yOut) / 2 + 2;
  const guide = `M${gb} ${H + 10}L${gm.toFixed(1)} ${ySplit}C${gm + 4} ${ySplit - 40} ${gm + 40} ${ge + 12} ${W - 24} ${ge}`;
  o.push(`<path d="${guide}" ${st(`fill:none;stroke:${V('j-case')};stroke-width:15;stroke-linecap:round;opacity:.9`)}/>`);
  o.push(`<path d="${guide}" ${st(`fill:none;stroke:${V('route')};stroke-width:9;stroke-linecap:round`)}/>`);
  o.push(`<path d="M${W - 30} ${ge - 12}L${W - 8} ${ge}L${W - 30} ${ge + 12}Z" ${st(`fill:${V('route')};stroke:${V('j-case')};stroke-width:2.5;stroke-linejoin:round`)}/>`);
  return o.join('');
}

function drawStraight(lanes) {
  const N = lanes.length;
  const xs = Array.from({ length: N + 1 }, (_, i) => 10 + (i * (W - 20)) / N);
  const yTop = 58;
  const vx = W / 2;
  const lx = (xb, y) => xb + (vx - xb) * ((H - y) / (H + 220));
  const o = [];
  const st = (s) => `style="${s}"`;
  o.push(`<path d="M${xs[0]} ${H}L${lx(xs[0], yTop).toFixed(1)} ${yTop}L${lx(xs[N], yTop).toFixed(1)} ${yTop}L${xs[N]} ${H}Z" ${st(`fill:${V('j-asphalt')}`)}/>`);
  lanes.forEach((l, i) => {
    if (!l.valid) return;
    o.push(`<path d="M${xs[i]} ${H}L${lx(xs[i], yTop).toFixed(1)} ${yTop}L${lx(xs[i + 1], yTop).toFixed(1)} ${yTop}L${xs[i + 1]} ${H}Z" ${st(`fill:${V('j-fill')}`)}/>`);
  });
  for (let i = 0; i <= N; i++) {
    const edge = i === 0 || i === N;
    o.push(`<path d="M${xs[i]} ${H}L${lx(xs[i], yTop).toFixed(1)} ${yTop}" ${st(`fill:none;stroke:${V('j-mark')};stroke-width:3${edge ? '' : ';stroke-dasharray:16 14'}`)}/>`);
  }
  lanes.forEach((l, i) => {
    const cb = (xs[i] + xs[i + 1]) / 2;
    [[H - 50, 38], [H - 100, 27]].forEach(([y, sz]) => o.push(groundArrow(l.glyph, lx(cb, y), y, sz * Math.min(1, 4 / N + 0.2), l.valid)));
  });
  const v = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
  const gb = (xs[v[0]] + xs[v[v.length - 1] + 1]) / 2;
  const guide = `M${gb} ${H + 10}L${lx(gb, yTop + 14).toFixed(1)} ${yTop + 14}`;
  o.push(`<path d="${guide}" ${st(`fill:none;stroke:${V('j-case')};stroke-width:15;stroke-linecap:round;opacity:.9`)}/>`);
  o.push(`<path d="${guide}" ${st(`fill:none;stroke:${V('route')};stroke-width:9;stroke-linecap:round`)}/>`);
  return o.join('');
}

function gantry(branch, l1, l2) {
  const st = (s) => `style="${s}"`;
  const w = 178;
  const x = branch === 'right' ? W - w - 14 : branch === 'left' ? 14 : (W - w) / 2;
  const arrow = branch === 'right' ? 'slight-right' : branch === 'left' ? 'slight-left' : 'straight';
  return `<path d="M6 54H${W - 6}" ${st('stroke:#7A8592;stroke-width:4')}/>`
    + `<rect x="${x}" y="6" width="${w}" height="46" rx="5" ${st(`fill:#00703C;stroke:${V('route')};stroke-width:3`)}/>`
    + `<rect x="${x + 3}" y="9" width="${w - 6}" height="40" rx="3" ${st('fill:none;stroke:#fff;stroke-width:1.5')}/>`
    + `<g transform="translate(${x + 8} 16) scale(1.05)" ${st('fill:none;stroke:#fff;stroke-width:2.8;stroke-linecap:square;stroke-linejoin:miter')}><path d="${ARROW[arrow]}"/></g>`
    + `<text x="${x + 40}" y="28" textLength="${Math.min(w - 50, l1.length * 9)}" lengthAdjust="spacingAndGlyphs" ${st("fill:#fff;font:800 16px 'Barlow Condensed','Arial Narrow',sans-serif")}>${esc(l1)}</text>`
    + `<text x="${x + 40}" y="43" textLength="${Math.min(w - 50, l2.length * 6.2)}" lengthAdjust="spacingAndGlyphs" ${st("fill:#CDE7D8;font:700 11px 'Barlow Condensed','Arial Narrow',sans-serif")}>${esc(l2)}</text>`;
}

/** SVG da visão da junção para a manobra. */
export function junctionSVG(info, step) {
  const st = (s) => `style="${s}"`;
  let body;
  if (info.branch === 'right') body = drawRight(info.lanes, info.k, false);
  else if (info.branch === 'left') {
    // espelho: inverte a ordem das faixas, desenha como saída à direita e espelha o desenho
    const mirrored = info.lanes.slice().reverse();
    body = `<g transform="translate(${W} 0) scale(-1 1)">${drawRight(mirrored, info.N - info.k, true)}</g>`;
  } else body = drawStraight(info.lanes);
  const [l1, l2] = signTexts(step);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(info.hint)}">`
    + `<rect width="${W}" height="${H}" ${st(`fill:${V('j-ground')}`)}/>`
    + body
    + `<circle cx="${W / 2}" cy="${H - 14}" r="12" ${st(`fill:${V('puck')};stroke:${V('j-case')};stroke-width:3`)}/>`
    + `<path transform="translate(${W / 2 - 8} ${H - 22}) scale(.66)" d="M12 2l8 19-8-4.5L4 21z" ${st(`fill:${V('puck-ink')}`)}/>`
    + gantry(info.branch, l1, l2)
    + '</svg>';
}
