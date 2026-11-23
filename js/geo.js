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

/**
 * Projeta a posição na rota. Retorna { offset, along, idx, point, bearing }.
 * `prevAlong` (progresso anterior, em metros): quando a rota passa duas vezes pelo mesmo lugar
 * (cruza a si mesma, ou vai e volta pela mesma rua até uma parada), o trecho mais perto pode
 * ser um que você já percorreu. Voltar no progresso custa caro e avançar muito custa um pouco,
 * então ganha o trecho coerente com onde você estava — e a placa não volta para uma manobra
 * que já passou.
 */
export const SNAP_BACK_COST = 0.5;   // cada metro "para trás" vale meio metro de distância da rota
export const SNAP_AHEAD_COST = 0.05; // cada metro à frente vale 5 cm (GPS que pulou continua ok)
export function snap(prep, pos, hint = 0, prevAlong = null) {
  const { coords, cum } = prep;
  const lat0 = rad(pos[1]);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const px = pos[0] * kx;
  const py = pos[1] * ky;
  const start = Math.max(0, hint - 30);
  const end = coords.length - 1;
  let best = { offset: Infinity, cost: Infinity };
  for (let i = start; i < end; i++) {
    const ax = coords[i][0] * kx, ay = coords[i][1] * ky;
    const bx = coords[i + 1][0] * kx, by = coords[i + 1][1] * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    const off = Math.hypot(px - qx, py - qy);
    const along = cum[i] + (cum[i + 1] - cum[i]) * t;
    const cost = prevAlong == null ? off
      : off + SNAP_BACK_COST * Math.max(0, prevAlong - along) + SNAP_AHEAD_COST * Math.max(0, along - prevAlong);
    if (cost < best.cost) {
      best = {
        cost, offset: off, idx: i, along,
        point: [qx / kx, qy / ky], bearing: bearing(coords[i], coords[i + 1]),
      };
    }
    // a partir de um ponto bom (perto da rota e coerente com o progresso), para de procurar
    // longe demais à frente
    if (best.cost < 15 && cum[i] - best.along > 400) break;
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

// ---------------- Velocidade da simulação ----------------
// Manobras em que dá para seguir sem frear (o resto pede redução antes do ponto).
const NO_SLOWDOWN = new Set(['depart', 'continue', 'new name', 'notification', 'merge', 'on ramp', 'off ramp', 'fork']);

/**
 * Velocidade (m/s) da simulação em `along` metros: a média prevista pelo servidor de rotas
 * para o trecho atual (distância ÷ tempo do passo), freando antes de curvas e da chegada
 * e acelerando aos poucos depois. `prev` é a velocidade do segundo anterior.
 * `cfg`: { simSpeed (reserva), sim: { min, max, turn } } do perfil (config.js).
 */
export function simSpeed(prep, along, prev, cfg, dt = 1) {
  const { min = 3, max = 30, turn = 6 } = cfg?.sim || {};
  const fallback = cfg?.simSpeed || 12;
  const steps = prep.steps || [];
  let i = 0;
  while (i + 1 < steps.length && steps[i + 1].at <= along) i++;
  const cur = steps[i];
  const avg = cur && cur.duration > 0 && cur.distance > 0 ? cur.distance / cur.duration : fallback;
  let target = Math.min(max, Math.max(min, avg));
  // frear antes da próxima manobra (curva, rotatória, chegada): v² = v_curva² + 2·a·d
  const next = steps.slice(i + 1).find((s) => !NO_SLOWDOWN.has(s.type));
  if (next) {
    const d = Math.max(0, next.at - along);
    const vIn = next.type === 'arrive' ? min : turn;
    target = Math.min(target, Math.sqrt(vIn * vIn + 2 * 1.6 * d));
  }
  const p = prev ?? Math.min(target, turn);
  // aceleração e frenagem suaves (≈ 2 m/s² para ganhar, 3 m/s² para perder)
  return Math.max(Math.min(target, p + 2 * dt), p - 3 * dt, 0.5);
}

/** Valor interpolado numa tabela [[x, y], …] em ordem de x (fora dela, o valor da ponta). */
export function interpolate(table, x) {
  if (!table?.length) return null;
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) { const [x0, y0] = table[i - 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return table[table.length - 1][1];
}
