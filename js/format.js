const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function fmtDistance(m) {
  if (m == null) return '';
  if (m < 1000) return `${nf0.format(Math.max(10, Math.round(m / 10) * 10))} m`;
  return `${(m < 10000 ? nf1 : nf0).format(m / 1000)} km`;
}

export function fmtDuration(s) {
  if (s == null) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Versão curta para botões estreitos: "7 min", "1h05", "24h45", "76h". */
export function fmtDurationShort(s) {
  if (s == null) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h >= 48 || !r) return `${h}h`;
  return `${h}h${String(r).padStart(2, '0')}`;
}

export function fmtArrival(s) {
  const d = new Date(Date.now() + s * 1000);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtCoords(lng, lat) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
