// Modo 3D do mapa: lógica pura (sem MapLibre nem DOM), para poder testar no Node.
// O map.js usa estas funções para a parede da rota, o prédio do destino e as setas 3D.

const R = 6371008.8; // raio médio da Terra (m)
const toRad = (d) => (d * Math.PI) / 180;
const mPerDegLat = (R * Math.PI) / 180;
const mPerDegLng = (lat) => mPerDegLat * Math.cos(toRad(lat));

// ---------------- Preferências → o que ligar ----------------

/**
 * O que fica ligado agora, a partir das preferências e da bateria.
 * `s`: { mapMode, b3dBuildings, b3dTerrain, b3dSky, b3dDest, b3dRoute, arrow, lowBatteryFlat }
 * `battery`: { level (0–1), charging } ou null quando o navegador não informa.
 */
export function effective3D(s, battery) {
  const wants = s.mapMode === '3d';
  const lowBattery = wants && !!s.lowBatteryFlat && !!battery && !battery.charging && battery.level < 0.2;
  const on = wants && !lowBattery;
  return {
    on,
    lowBattery,
    buildings: on && !!s.b3dBuildings,
    terrain: on && !!s.b3dTerrain,
    sky: on && !!s.b3dSky,
    dest: on && !!s.b3dDest,
    route: on && !!s.b3dRoute,
    arrow: on && (s.arrow === 'waze' || s.arrow === 'ball3d') ? s.arrow : 'ball',
  };
}

// ---------------- Parede de luz ao longo da rota ----------------

/**
 * Faixa estreita ao longo da linha, um quadrilátero por trecho (estendido meia largura nas
 * pontas para fechar as curvas), pronta para virar fill-extrusion.
 */
export function corridor(coords, widthM = 2.4) {
  const half = widthM / 2;
  const features = [];
  for (let i = 0; i < (coords?.length || 0) - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const kx = mPerDegLng(a[1]);
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * mPerDegLat;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const ux = dx / len, uy = dy / len;
    const pt = (base, along, side) => [
      base[0] + (ux * along - uy * side) / kx,
      base[1] + (uy * along + ux * side) / mPerDegLat,
    ];
    const ring = [pt(a, -half, half), pt(b, half, half), pt(b, half, -half), pt(a, -half, -half)];
    ring.push(ring[0]);
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });
  }
  return { type: 'FeatureCollection', features };
}

// ---------------- Prédio do destino ----------------

/** Ponto dentro do anel (lng/lat), por cruzamentos. */
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const polygonsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

function distToRingM(p, ring) {
  let best = Infinity;
  const kx = mPerDegLng(p[1]);
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - p[0]) * kx, ay = (ring[i][1] - p[1]) * mPerDegLat;
    const bx = (ring[i + 1][0] - p[0]) * kx, by = (ring[i + 1][1] - p[1]) * mPerDegLat;
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(ax + vx * t, ay + vy * t));
  }
  return best;
}

/**
 * Escolhe o prédio do lugar entre as feições do mapa perto do ponto: o que contém o ponto;
 * senão, o mais próximo até `maxM` metros. Devolve { geometry, height, base } ou null.
 */
export function pickBuilding(features, lngLat, maxM = 15) {
  let near = null;
  for (const f of features || []) {
    for (const rings of polygonsOf(f.geometry)) {
      const [outer, ...holes] = rings;
      if (!outer || outer.length < 4) continue;
      const hit = pointInRing(lngLat, outer) && !holes.some((h) => pointInRing(lngLat, h));
      // fora (ou num pátio interno): distância até a borda mais próxima, de fora ou do pátio
      const d = hit ? 0 : Math.min(...rings.map((r) => distToRingM(lngLat, r)));
      if (d <= maxM && (!near || d < near.d)) near = { d, rings, props: f.properties || {} };
      if (hit) break;
    }
    if (near?.d === 0) break;
  }
  if (!near) return null;
  const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
  const height = num(near.props.render_height) ?? num(near.props.height) ?? 8;
  const base = num(near.props.render_min_height) ?? num(near.props.min_height) ?? 0;
  return { geometry: { type: 'Polygon', coordinates: near.rings }, height: Math.max(height, base + 3), base };
}

/**
 * Afasta o contorno externo `meters` para fora (cantos em esquadria, limitada a 2×).
 * Usado no prédio em destaque: se as paredes ficarem exatamente sobre as do prédio do mapa,
 * a placa de vídeo alterna entre as duas e aparecem listras ("z-fighting").
 */
export function inflatePolygon(geometry, meters) {
  if (geometry?.type !== 'Polygon' || !geometry.coordinates?.[0]?.length) return geometry;
  const [outer, ...holes] = geometry.coordinates;
  const ring = outer[0][0] === outer.at(-1)[0] && outer[0][1] === outer.at(-1)[1] ? outer.slice(0, -1) : outer.slice();
  if (ring.length < 3) return geometry;
  const lat0 = ring[0][1];
  const kx = mPerDegLng(lat0);
  const P = ring.map(([x, y]) => [(x - ring[0][0]) * kx, (y - lat0) * mPerDegLat]);
  // orientação do anel (área com sinal): define qual lado é "fora"
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const out = area > 0 ? 1 : -1; // anti-horário: a normal de fora fica à direita do sentido da borda
  const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; return [(dy / L) * out, (-dx / L) * out]; };
  const moved = P.map((p, i) => {
    const prev = P[(i - 1 + P.length) % P.length], next = P[(i + 1) % P.length];
    const n1 = normal(prev, p), n2 = normal(p, next);
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { bx = n1[0]; by = n1[1]; } else { bx /= bl; by /= bl; }
    const cos = bx * n1[0] + by * n1[1];
    const d = meters / Math.max(cos, 0.5);
    return [p[0] + bx * d, p[1] + by * d];
  }).map(([x, y]) => [ring[0][0] + x / kx, lat0 + y / mPerDegLat]);
  moved.push(moved[0]);
  return { type: 'Polygon', coordinates: [moved, ...holes] };
}

// ---------------- Setas 3D ----------------

// Seta "estilo Waze": ponta, asas e entalhe atrás. Os cantos são só levemente arredondados.
const ARROW = [[0, 7], [5.2, -4.6], [0, -2], [-5.2, -4.6]];
const ARROW_R = [1.0, 0.9, 0.7, 0.9];

/** Contorno com cantos arredondados por curvas quadráticas; `mids` = índice do meio de cada canto. */
export function roundedOutline(poly, radii, samples = 5) {
  const pts = [];
  const mids = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const toward = (a, b, d) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const k = Math.min(d, len * 0.45) / len;
      return [a[0] + dx * k, a[1] + dy * k];
    };
    const a = toward(p1, p0, radii[i]);
    const b = toward(p1, p2, radii[i]);
    const start = pts.length;
    for (let k = 0; k < samples; k++) {
      const t = k / (samples - 1);
      pts.push([
        (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0],
        (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1],
      ]);
    }
    mids.push(start + Math.floor(samples / 2));
  }
  return { pts, mids };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mistura duas cores #RRGGBB (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pathD = (pts) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L')}Z`;

/**
 * Projeção simples (ortográfica) do chão inclinado: `rel` = rumo da seta em relação ao topo
 * da tela (graus, horário), `pitch` = inclinação do mapa (0 = visto de cima).
 */
function projector(rel, pitch, scale) {
  const r = toRad(rel), p = toRad(pitch);
  const c = Math.cos(r), s = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p);
  return (x, y, z = 0) => {
    const xr = x * c + y * s;
    const yr = -x * s + y * c;
    return [xr * scale, -(yr * cp + z * sp) * scale];
  };
}

function solid(proj, outline, z0, h, scale, pitch, side, ink, strokeW) {
  const px = h * scale * Math.sin(toRad(pitch));
  const steps = Math.max(2, Math.ceil(px / 0.9));
  let out = '';
  for (let k = 0; k < steps; k++) {
    const z = z0 + (h * k) / steps;
    const st = k === 0 ? ` stroke="${ink}" stroke-width="${f1(strokeW * 1.3)}" stroke-linejoin="round"` : '';
    out += `<path d="${pathD(outline.map(([x, y]) => proj(x, y, z)))}" fill="${side}"${st}/>`;
  }
  return out;
}

function arrowParts(proj, { rel, pitch, scale, z0, h, k, colors, strokeW }) {
  const { pts, mids } = roundedOutline(ARROW.map(([x, y]) => [x * k, y * k]), ARROW_R.map((r) => r * k));
  const [tipI, , notchI] = [mids[0], mids[1], mids[2]];
  const zt = z0 + h;
  const top = pts.map(([x, y]) => proj(x, y, zt));
  const right = pts.slice(tipI, notchI + 1).map(([x, y]) => proj(x, y, zt));
  const left = pts.slice(notchI).concat(pts.slice(0, tipI + 1)).map(([x, y]) => proj(x, y, zt));
  // a metade virada para a esquerda da tela fica mais clara (luz vindo da esquerda)
  const leftIsLit = Math.cos(toRad(rel)) >= 0;
  const [tipP, notchP] = [proj(...pts[tipI], zt), proj(...pts[notchI], zt)];
  return solid(proj, pts, z0, h, scale, pitch, colors.side, colors.ink, strokeW)
    + `<path d="${pathD(top)}" fill="${colors.dim}"/>`
    + `<path d="${pathD(leftIsLit ? left : right)}" fill="${colors.lit}"/>`
    + `<path d="${pathD(top)}" fill="none" stroke="${colors.ink}" stroke-width="${f1(strokeW)}" stroke-linejoin="round"/>`
    + `<line x1="${f1(tipP[0])}" y1="${f1(tipP[1])}" x2="${f1(notchP[0])}" y2="${f1(notchP[1])}" stroke="${colors.ridge}" stroke-opacity=".6" stroke-width="${f1(strokeW * 0.8)}" stroke-linecap="round"/>`;
}

const circle = (r, n = 40) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);

/**
 * SVG da seta de navegação em 3D.
 * `style`: 'waze' (A, seta com volume) ou 'ball3d' (B, bolinha com volume e a setinha em cima).
 * `color`/`ink`: cor da seta e do contorno/da setinha (vêm do tema).
 */
export function puckSVG(style, rel, pitch, { color = '#C8FF3D', ink = '#0B0D10', size = 104 } = {}) {
  const scale = 5.4;
  const proj = projector(rel, Math.max(0, Math.min(85, pitch)), scale);
  const half = size / 2;
  const colors = { lit: mix(color, '#FFFFFF', 0.35), dim: mix(color, '#000000', 0.1), side: mix(color, '#000000', 0.38), ink, ridge: mix(color, '#FFFFFF', 0.8) };
  let body;
  if (style === 'ball3d') {
    const r = 5;
    const ground = (pts, dx = 0, dy = 0) => pathD(pts.map(([x, y]) => { const [a, b] = proj(x, y, 0); return [a + dx, b + dy]; }));
    const zt = 1.3;
    const highlight = Array.from({ length: 13 }, (_, i) => Math.PI * (0.55 + (0.4 * i) / 12)).map((a) => proj(r * 0.82 * Math.cos(a), r * 0.82 * Math.sin(a), zt));
    body = `<path d="${ground(circle(r * 1.75))}" fill="${color}" fill-opacity=".18"/>`
      + `<path d="${ground(circle(r * 1.04), 2, 2.5)}" fill="#000000" fill-opacity=".35"/>`
      + solid(proj, circle(r), 0.1, zt - 0.1, scale, pitch, colors.side, ink, 1.2)
      + `<path d="${pathD(circle(r).map(([x, y]) => proj(x, y, zt)))}" fill="${color}" stroke="${ink}" stroke-width="1.4"/>`
      + `<path d="M${highlight.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L')}" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>`
      + arrowParts(proj, { rel, pitch, scale, z0: zt, h: 0.9, k: 0.5, strokeW: 1, colors: { lit: mix(ink, '#FFFFFF', 0.18), dim: ink, side: mix(ink, '#000000', 0.5), ink: mix(ink, '#000000', 0.5), ridge: mix(ink, '#FFFFFF', 0.4) } });
  } else {
    const { pts } = roundedOutline(ARROW, ARROW_R);
    const shadow = pathD(pts.map(([x, y]) => { const [a, b] = proj(x * 1.06, y * 1.06, 0); return [a + 2, b + 2.5]; }));
    body = `<path d="${shadow}" fill="#000000" fill-opacity=".38"/>`
      + arrowParts(proj, { rel, pitch, scale, z0: 0.15, h: 1.5, k: 1, strokeW: 1.4, colors });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
