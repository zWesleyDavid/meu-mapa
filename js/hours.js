// Horário de funcionamento no formato opening_hours do OpenStreetMap.
// Cobre os casos comuns: "24/7", "Mo-Fr 08:00-18:00; Sa 08:00-12:00", "Su off",
// várias faixas ("08:00-12:00,14:00-18:00"), madrugada ("18:00-02:00") e regras sem dias.
// Feriados (PH) são ignorados. Formato que não entender → null (mostramos o texto original).

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DAY_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DAY_TOKEN = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)';
const DAY_ITEM = `${DAY_TOKEN}(?:\\s*-\\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?`;
const RULE_RE = new RegExp(`^(${DAY_ITEM}(?:\\s*,\\s*${DAY_ITEM})*)?\\s*(.*)$`);

function expandDays(part) {
  const out = new Set();
  for (const item of part.split(',').map((x) => x.trim())) {
    const [a, b] = item.split('-').map((x) => x.trim());
    if (a === 'PH' || a === 'SH') continue;
    const i = DAYS.indexOf(a);
    if (i < 0) return null;
    if (!b) { out.add(i); continue; }
    const j = DAYS.indexOf(b);
    if (j < 0) return null;
    for (let k = i; ; k = (k + 1) % 7) { out.add(k); if (k === j) break; }
  }
  return [...out];
}

function parseRanges(text) {
  const t = text.trim();
  if (/^(off|closed|fechado)$/i.test(t)) return [];
  if (t === '24/7' || t === '00:00-24:00') return [{ from: 0, to: 1440 }];
  const ranges = [];
  for (const piece of t.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = piece.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/);
    if (!m) return null;
    const from = +m[1] * 60 + +m[2];
    let to = +m[3] * 60 + +m[4];
    if (to <= from) to += 1440; // passa da meia-noite
    ranges.push({ from, to });
  }
  return ranges.length ? ranges : null;
}

/** → { always, week: [[{from,to}], ... 7 dias, seg=0] } ou null */
export function parseOpeningHours(str) {
  if (!str || typeof str !== 'string') return null;
  let s = str.trim();
  if (/^24\/7$/.test(s)) return { always: true, week: Array.from({ length: 7 }, () => [{ from: 0, to: 1440 }]) };
  // vírgula usada no lugar de ponto e vírgula: "Mo-Fr 08:00-18:00, Sa 08:00-12:00"
  s = s.replace(/(\d|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/gi, '$1; ');
  const week = Array.from({ length: 7 }, () => []);
  let any = false;
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(RULE_RE);
    if (!m) return null;
    const days = m[1] ? expandDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (days == null) return null;
    if (m[1] && !days.length) continue; // regra só de feriado
    const ranges = parseRanges(m[2] || '');
    if (ranges == null) return null;
    days.forEach((d) => { week[d] = ranges; });
    any = true;
  }
  if (!any) return null;
  const always = week.every((r) => r.length === 1 && r[0].from === 0 && r[0].to >= 1440);
  return { always, week };
}

const hhmm = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function formatRanges(ranges) {
  if (!ranges.length) return 'Fechado';
  if (ranges.length === 1 && ranges[0].from === 0 && ranges[0].to >= 1440) return '24 horas';
  return ranges.map((r) => `${hhmm(r.from)}–${hhmm(r.to)}`).join(', ');
}

/** Situação agora: { open, text, soon } */
export function openStatus(parsed, now = new Date()) {
  if (!parsed) return null;
  if (parsed.always) return { open: true, text: 'Aberto 24 horas', soon: false };
  const day = (now.getDay() + 6) % 7;
  const m = now.getHours() * 60 + now.getMinutes();
  const { week } = parsed;

  // Aberto por uma faixa de hoje ou pela madrugada de ontem?
  const yesterday = week[(day + 6) % 7];
  let closesAt = null;
  for (const r of week[day]) if (r.from <= m && m < r.to) closesAt = r.to;
  for (const r of yesterday) if (r.to > 1440 && m < r.to - 1440) closesAt = r.to - 1440;
  if (closesAt != null) {
    // emenda com a faixa seguinte (ex.: 18:00-24:00 + 00:00-02:00)
    const left = closesAt - m;
    return {
      open: true,
      soon: left <= 60,
      text: left <= 60 ? `Fecha em breve · às ${hhmm(closesAt)}` : `Fecha às ${hhmm(closesAt)}`,
    };
  }
  // Próxima abertura
  const later = week[day].filter((r) => r.from > m).sort((a, b) => a.from - b.from)[0];
  if (later) return { open: false, soon: later.from - m <= 60, text: `Abre às ${hhmm(later.from)}` };
  for (let k = 1; k <= 7; k++) {
    const d = (day + k) % 7;
    const first = [...week[d]].sort((a, b) => a.from - b.from)[0];
    if (first) {
      const when = k === 1 ? 'amanhã' : DAY_SHORT[d];
      return { open: false, soon: false, text: `Abre ${when} às ${hhmm(first.from)}` };
    }
  }
  return { open: false, soon: false, text: 'Fechado' };
}

export function todayIndex(now = new Date()) { return (now.getDay() + 6) % 7; }
