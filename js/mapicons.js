// Ícones próprios do mapa (estilo "Placa"): desenhados no próprio app com Canvas 2D,
// sem depender de arquivos de sprite. Cada ícone é criado sob demanda quando o mapa pede.

// Desenhos (traço, grade 24x24) só com <path>, para o Path2D do canvas.
const GLYPH = {
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3',
  cafe: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2',
  shop: 'M3 4h2l2.4 10.2a1.5 1.5 0 0 0 1.5 1.1h8.3a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2M8.2 19.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M15.7 19.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  pharmacy: 'M9.47 19.47L19.47 9.47A3.5 3.5 0 0 0 14.53 4.53L4.53 14.53A3.5 3.5 0 0 0 9.47 19.47ZM9.5 9.5L14.5 14.5',
  health: 'M12 5v14M5 12h14',
  fuel: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M8 8h4M15 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3',
  bus: 'M8 3h8a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM5 11h14M8 21v-3M16 21v-3',
  park: 'M12 22v-6M12 3l6 9h-3l4 5H5l4-5H6z',
  sport: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18M3.5 9h17M3.5 15h17',
  school: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
  services: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  lodging: 'M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M5.4 11a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
  attraction: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  parking: 'M8 20V4h5a4 4 0 0 1 0 8H8',
  worship: 'M12 3v5M9.5 5.5h5M6 21v-9l6-4 6 4v9M10 21v-4h4v4',
  default: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
};

// cor do selo, cor do desenho, cor do nome no tema escuro, no tema claro
export const CATEGORIES = {
  food:       { bg: '#E2701C', fg: '#FFFFFF', dark: '#F6A866', light: '#A94F0B' },
  cafe:       { bg: '#B07636', fg: '#FFFFFF', dark: '#E0B07C', light: '#86531F' },
  shop:       { bg: '#7B5AE6', fg: '#FFFFFF', dark: '#B9A6FF', light: '#5A3CC4' },
  pharmacy:   { bg: '#DD3B53', fg: '#FFFFFF', dark: '#FF8C9C', light: '#B42039' },
  health:     { bg: '#DD3B53', fg: '#FFFFFF', dark: '#FF8C9C', light: '#B42039' },
  fuel:       { bg: '#128EA1', fg: '#FFFFFF', dark: '#6FD3E2', light: '#0B6B7A' },
  parking:    { bg: '#128EA1', fg: '#FFFFFF', dark: '#6FD3E2', light: '#0B6B7A' },
  bus:        { bg: '#2F6FE0', fg: '#FFFFFF', dark: '#8DB4FF', light: '#1F55B8', size: 18 },
  park:       { bg: '#22A05A', fg: '#FFFFFF', dark: '#79DB9E', light: '#157A41' },
  sport:      { bg: '#22A05A', fg: '#FFFFFF', dark: '#79DB9E', light: '#157A41' },
  school:     { bg: '#E8B526', fg: '#1A1300', dark: '#F5D372', light: '#8A6500' },
  lodging:    { bg: '#C24C9C', fg: '#FFFFFF', dark: '#F29AD3', light: '#9A2E78' },
  attraction: { bg: '#C24C9C', fg: '#FFFFFF', dark: '#F29AD3', light: '#9A2E78' },
  services:   { bg: '#5F6F89', fg: '#FFFFFF', dark: '#AEB9CB', light: '#46546B' },
  worship:    { bg: '#5F6F89', fg: '#FFFFFF', dark: '#AEB9CB', light: '#46546B' },
  default:    { bg: '#5F6F89', fg: '#FFFFFF', dark: '#AEB9CB', light: '#46546B', size: 18 },
};

// Classes de POI do esquema OpenMapTiles → categoria do app
const CLASS_MAP = {
  food: ['restaurant', 'fast_food', 'bar', 'pub', 'beer', 'biergarten', 'ice_cream', 'food_court'],
  cafe: ['cafe', 'bakery', 'coffee', 'pastry'],
  shop: ['shop', 'grocery', 'supermarket', 'convenience', 'clothing_store', 'alcohol_shop', 'mall', 'marketplace',
    'department_store', 'butcher', 'books', 'jewelry', 'florist', 'mobile_phone', 'electronics', 'hardware',
    'furniture', 'shoes', 'gift', 'optician', 'pet', 'greengrocer', 'beauty', 'hairdresser', 'cosmetics'],
  pharmacy: ['pharmacy', 'chemist'],
  health: ['hospital', 'doctors', 'dentist', 'clinic', 'veterinary'],
  fuel: ['fuel', 'car', 'car_repair', 'charging_station', 'car_wash'],
  parking: ['parking', 'bicycle_parking', 'bicycle'],
  bus: ['bus', 'railway', 'bus_station', 'bus_stop', 'ferry_terminal', 'aerialway', 'harbor', 'subway', 'tram_stop'],
  park: ['park', 'garden', 'playground', 'nature_reserve', 'campsite', 'zoo', 'picnic_site'],
  sport: ['pitch', 'stadium', 'sports_centre', 'swimming', 'swimming_pool', 'golf', 'fitness_centre', 'fitness', 'sports'],
  school: ['school', 'college', 'university', 'kindergarten', 'library'],
  lodging: ['lodging', 'hotel', 'hostel', 'motel', 'guest_house'],
  attraction: ['attraction', 'museum', 'art_gallery', 'theatre', 'cinema', 'music', 'castle', 'monument', 'viewpoint'],
  services: ['bank', 'atm', 'post', 'town_hall', 'police', 'fire_station', 'laundry', 'government', 'toilets', 'office', 'information'],
  worship: ['place_of_worship'],
};

function matchOn(prop, fallback) {
  const expr = ['match', ['get', prop]];
  for (const [cat, list] of Object.entries(CLASS_MAP)) expr.push(list, cat);
  expr.push(fallback);
  return expr;
}

/** Expressão MapLibre que devolve a categoria do app para um POI (classe, depois subclasse). */
export function categoryExpr() {
  return matchOn('class', matchOn('subclass', 'default'));
}

export function iconExpr(theme, dot = false) {
  return ['concat', dot ? `mm-${theme}-dot-` : `mm-${theme}-`, categoryExpr()];
}

export function labelColorExpr(theme) {
  const expr = ['match', categoryExpr()];
  for (const [cat, c] of Object.entries(CATEGORIES)) if (cat !== 'default') expr.push(cat, c[theme]);
  expr.push(CATEGORIES.default[theme]);
  return expr;
}

const RING = { dark: '#101317', light: '#FFFFFF' };
const SHIELD = { dark: { bg: '#C8FF3D', border: '#0B0D10' }, light: { bg: '#0E2A47', border: '#FFFFFF' } };
export const SHIELD_TEXT = { dark: '#0B0D10', light: '#FFFFFF' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const PR = 2; // densidade dos ícones (retina)

function drawTile(theme, cat) {
  const c = CATEGORIES[cat] || CATEGORIES.default;
  const size = c.size || 24;
  const ring = 2;
  const full = (size + ring * 2) * PR;
  const cv = makeCanvas(full, full);
  const ctx = cv.getContext('2d');
  ctx.scale(PR, PR);
  ctx.fillStyle = RING[theme];
  roundRect(ctx, 0, 0, size + ring * 2, size + ring * 2, size * 0.3 + ring);
  ctx.fill();
  ctx.fillStyle = c.bg;
  roundRect(ctx, ring, ring, size, size, size * 0.3);
  ctx.fill();
  const g = size * 0.62;
  ctx.save();
  ctx.translate(ring + (size - g) / 2, ring + (size - g) / 2);
  ctx.scale(g / 24, g / 24);
  ctx.strokeStyle = c.fg;
  ctx.lineWidth = Math.min(2.8, 1.8 / (g / 24));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(GLYPH[cat] || GLYPH.default));
  ctx.restore();
  return ctx.getImageData(0, 0, full, full);
}

function drawDot(theme, cat) {
  const c = CATEGORIES[cat] || CATEGORIES.default;
  const full = 12 * PR;
  const cv = makeCanvas(full, full);
  const ctx = cv.getContext('2d');
  ctx.scale(PR, PR);
  ctx.fillStyle = RING[theme];
  ctx.beginPath(); ctx.arc(6, 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.bg;
  ctx.beginPath(); ctx.arc(6, 6, 4, 0, Math.PI * 2); ctx.fill();
  return ctx.getImageData(0, 0, full, full);
}

function drawShield(theme) {
  const s = SHIELD[theme];
  const w = 28, h = 20;
  const cv = makeCanvas(w * PR, h * PR);
  const ctx = cv.getContext('2d');
  ctx.scale(PR, PR);
  ctx.fillStyle = s.border;
  roundRect(ctx, 0, 0, w, h, 6); ctx.fill();
  ctx.fillStyle = s.bg;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 4.5); ctx.fill();
  return ctx.getImageData(0, 0, w * PR, h * PR);
}

/** Atende o pedido do mapa por uma imagem "mm-..." que ainda não existe. */
export function provideIcon(map, id) {
  if (!id.startsWith('mm-') || map.hasImage(id)) return;
  const [, theme, ...rest] = id.split('-');
  if (theme !== 'dark' && theme !== 'light') return;
  try {
    if (rest[0] === 'shield') {
      map.addImage(id, drawShield(theme), {
        pixelRatio: PR,
        stretchX: [[7 * PR, 21 * PR]], stretchY: [[7 * PR, 13 * PR]], content: [5 * PR, 3 * PR, 23 * PR, 17 * PR],
      });
    } else if (rest[0] === 'dot') {
      map.addImage(id, drawDot(theme, rest[1]), { pixelRatio: PR });
    } else {
      map.addImage(id, drawTile(theme, rest[0]), { pixelRatio: PR });
    }
  } catch (err) {
    console.warn('Ícone não criado', id, err);
  }
}
