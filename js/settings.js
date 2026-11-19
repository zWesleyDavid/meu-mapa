// Preferências do usuário (ficam no aparelho) e abreviação de nomes de ruas.
import { bus, store } from './core.js';

const DEFAULTS = {
  theme: 'auto',          // auto | light | dark
  abbreviate: true,       // R., Av., Dr.… na placa
  voice: true,            // instruções faladas
  autoCollapse: true,     // card da navegação recolhe sozinho com o celular deitado
};

export function getSetting(key) {
  if (key === 'theme') return store.get('theme', null) || 'auto';
  if (key === 'voice') return !store.get('muted', false);
  return store.get(`set:${key}`, DEFAULTS[key]);
}

export function setSetting(key, value) {
  if (key === 'theme') store.set('theme', value === 'auto' ? null : value);
  else if (key === 'voice') store.set('muted', !value);
  else store.set(`set:${key}`, value);
  bus.emit('settings:changed', { key, value });
}

// ---------------- Abreviações (padrão dos Correios / placas) ----------------
// Tipo da via: só no começo do nome. Títulos: em qualquer posição.
const TYPES = [
  ['Avenida', 'Av.'], ['Rua', 'R.'], ['Travessa', 'Tv.'], ['Rodovia', 'Rod.'], ['Estrada', 'Estr.'],
  ['Alameda', 'Al.'], ['Praça', 'Pç.'], ['Servidão', 'Serv.'], ['Largo', 'Lg.'], ['Ladeira', 'Ld.'],
  ['Viaduto', 'Vd.'], ['Elevado', 'Elev.'], ['Marginal', 'Marg.'], ['Parque', 'Pq.'], ['Beco', 'Bc.'],
  ['Caminho', 'Cam.'], ['Via Expressa', 'V. Expr.'], ['Acesso', 'Ac.'], ['Contorno', 'Cont.'],
];
const TITLES = [
  ['Doutora', 'Dra.'], ['Doutor', 'Dr.'], ['Professora', 'Profa.'], ['Professor', 'Prof.'],
  ['Deputada', 'Dep.'], ['Deputado', 'Dep.'], ['Senadora', 'Sen.'], ['Senador', 'Sen.'],
  ['Governadora', 'Gov.'], ['Governador', 'Gov.'], ['Presidenta', 'Pres.'], ['Presidente', 'Pres.'],
  ['Vereadora', 'Ver.'], ['Vereador', 'Ver.'], ['Prefeita', 'Pref.'], ['Prefeito', 'Pref.'],
  ['Coronel', 'Cel.'], ['General', 'Gen.'], ['Capitão', 'Cap.'], ['Tenente', 'Ten.'], ['Sargento', 'Sgt.'],
  ['Marechal', 'Mal.'], ['Almirante', 'Alm.'], ['Brigadeiro', 'Brig.'], ['Major', 'Maj.'],
  ['Engenheira', 'Eng.'], ['Engenheiro', 'Eng.'], ['Desembargador', 'Des.'], ['Ministro', 'Min.'],
  ['Padre', 'Pe.'], ['Monsenhor', 'Mons.'], ['Frei', 'Fr.'], ['Dom', 'D.'],
  ['Nossa Senhora', 'N. Sra.'], ['Comendador', 'Com.'], ['Visconde', 'Visc.'], ['Barão', 'B.'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPE_RE = TYPES.map(([w, a]) => [new RegExp(`^${esc(w)}(?=\\s)`, 'i'), a]);
const TITLE_RE = TITLES.map(([w, a]) => [new RegExp(`(^|\\s)${esc(w)}(?=\\s)`, 'gi'), a]);

/** "Rua Doutor Leonel Pereira" → "R. Dr. Leonel Pereira" */
export function abbreviate(name) {
  if (!name) return name;
  let out = name.trim();
  for (const [re, a] of TYPE_RE) { if (re.test(out)) { out = out.replace(re, a); break; } }
  for (const [re, a] of TITLE_RE) out = out.replace(re, (m, pre) => `${pre}${a}`);
  return out;
}

/** Abrevia só se a preferência estiver ligada. */
export function signName(name) {
  return getSetting('abbreviate') ? abbreviate(name) : name;
}
