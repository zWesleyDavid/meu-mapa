// Setas de manobra no estilo de placa de trânsito: haste com cantos arredondados + ponta sólida.
// Grade 48x48. A haste é um traço grosso (sem pontas quadradas, que causavam "espetos");
// a ponta é um triângulo preenchido, então o encaixe fica limpo em qualquer tamanho.

// A espessura da haste (8 na grade de 48) fica no CSS: .mv .sh { stroke-width }.

/** Triângulo da ponta: vértice em (tx,ty), apontando na direção (dx,dy) normalizada. */
function head(tx, ty, dx, dy, len = 15, half = 12.5) {
  const n = Math.hypot(dx, dy); dx /= n; dy /= n;
  const bx = tx - dx * len, by = ty - dy * len;
  const px = -dy * half, py = dx * half;
  const f = (v) => v.toFixed(2);
  return `M${f(tx)} ${f(ty)}L${f(bx + px)} ${f(by + py)}L${f(bx - px)} ${f(by - py)}Z`;
}

/** Recua a haste para terminar dentro da ponta (evita fresta). */
const into = (tx, ty, dx, dy, len = 15) => {
  const n = Math.hypot(dx, dy);
  return [tx - (dx / n) * (len - 1), ty - (dy / n) * (len - 1)];
};

function shape(shaft, headPath, extra = '') {
  return `<path class="sh" d="${shaft}"/>${extra}<path class="hd" d="${headPath}"/>`;
}

function build() {
  const S = {};
  // reto
  {
    const [x, y] = into(24, 4, 0, -1);
    S.straight = shape(`M24 45V${y}`, head(24, 4, 0, -1));
  }
  // virar à direita / esquerda (curva de raio 9)
  {
    const [x] = into(45, 17, 1, 0);
    S.right = shape(`M13 45V27a9 9 0 0 1 9-10H${x}`, head(45, 17, 1, 0));
  }
  // levemente à direita (45°)
  {
    const [x, y] = into(41, 7, 1, -1);
    S['slight-right'] = shape(`M17 45V31L${x.toFixed(2)} ${y.toFixed(2)}`, head(41, 7, 1, -1));
  }
  // acentuadamente à direita (volta para baixo)
  {
    const [x, y] = into(42, 42, 1, 1);
    // topo arredondado em vez de bico
    S['sharp-right'] = shape(`M13 45V17a6 6 0 0 1 10.24-4.24L${x.toFixed(2)} ${y.toFixed(2)}`, head(42, 42, 1, 1));
  }
  // retorno (no Brasil, pela esquerda)
  {
    const [, y] = into(13, 45, 0, 1);
    S.uturn = shape(`M33 45V21a10 10 0 0 0-20 0V${y}`, head(13, 45, 0, 1));
  }
  // rotatória: anel + entrada por baixo + saída para cima à direita
  {
    const [x, y] = into(44, 5, 1, -1, 13);
    // anel um pouco à esquerda/baixo para a saída respirar; a haste da saída parte do anel
    S.roundabout = shape(`M21 46V37M27.4 21.6L${x.toFixed(2)} ${y.toFixed(2)}`, head(44, 5, 1, -1, 13, 11),
      '<circle class="sh" cx="21" cy="28" r="9"/>');
  }
  // espelhos para a esquerda
  const mirror = (svg) => `<g transform="translate(48 0) scale(-1 1)">${svg}</g>`;
  S.left = mirror(S.right);
  S['slight-left'] = mirror(S['slight-right']);
  S['sharp-left'] = mirror(S['sharp-right']);
  // partida e chegada
  S.depart = S.straight;
  S.arrive = '<path class="sh" d="M13 46V5"/><path class="hd" d="M13 5H38L32 14.5L38 24H13Z"/>';
  return S;
}

const SHAPES = build();

export function maneuverIcon(name) {
  return `<svg class="mv" viewBox="0 0 48 48" aria-hidden="true">${SHAPES[name] || SHAPES.straight}</svg>`;
}

