// Geometria simples para a navegação (projeção local plana: precisa o bastante em escala urbana).
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distance(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Prepara uma rota: distâncias acumuladas e posição (em metros) de cada manobra ao longo dela. */
export function prepareRoute(route) {
  const coords = route.geometry.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distance(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || route.distance || 0;

  let from = 0;
  const steps = route.steps.map((s) => {
    let best = from;
    let bestD = Infinity;
    if (s.location) {
      for (let i = from; i < coords.length; i++) {
        const d = distance(coords[i], s.location);
        if (d < bestD) { bestD = d; best = i; }
        if (d < 0.5) break;
      }
    }
    from = best;
    return { ...s, at: cum[best] };
  });
  return { ...route, coords, cum, total, steps };
}

/** Projeta a posição na rota. Retorna { offset, along, idx, point, bearing }. */
export function snap(prep, pos, hint = 0) {
  const { coords, cum } = prep;
  const lat0 = rad(pos[1]);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const px = pos[0] * kx;
  const py = pos[1] * ky;
  const start = Math.max(0, hint - 30);
  const end = coords.length - 1;
  let best = { offset: Infinity };
  for (let i = start; i < end; i++) {
    const ax = coords[i][0] * kx, ay = coords[i][1] * ky;
    const bx = coords[i + 1][0] * kx, by = coords[i + 1][1] * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    const off = Math.hypot(px - qx, py - qy);
    if (off < best.offset) {
      const seg = cum[i + 1] - cum[i];
      best = {
        offset: off, idx: i, along: cum[i] + seg * t,
        point: [qx / kx, qy / ky], bearing: bearing(coords[i], coords[i + 1]),
      };
    }
    // a partir de um ponto bom, para de procurar longe demais à frente
    if (best.offset < 15 && cum[i] - best.along > 400) break;
  }
  return best;
}

/** Ponto a uma distância "along" da rota (usado na simulação). */
export function pointAt(prep, along) {
  const { coords, cum } = prep;
  if (along <= 0) return { point: coords[0], bearing: bearing(coords[0], coords[1] || coords[0]) };
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] >= along) {
      const t = (along - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      const a = coords[i - 1], b = coords[i];
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearing(a, b) };
    }
  }
  const n = coords.length;
  return { point: coords[n - 1], bearing: bearing(coords[n - 2] || coords[n - 1], coords[n - 1]) };
}
