// Estilo próprio do mapa: parte do OpenFreeMap (esquema OpenMapTiles) e aplica as cores do app
// nos dois temas, com mais nomes de ruas, mais pontos de interesse e números das casas.
import { CONFIG } from './config.js';

const PALETTE = {
  dark: {
    bg: '#101317', water: '#0A1922', waterLine: '#123044', park: '#122019', parkLine: '#183026',
    landuse: '#13171C', building: '#1B2028', buildingLine: '#232A33',
    casing: '#0B0D10', minor: '#232932', major: '#2D3540', motorway: '#3A4350', path: '#1F252D', rail: '#2A313B',
    roadLabel: '#D5DAE1', roadLabelMinor: '#A3ABB6', halo: '#101317',
    poi: '#B6BEC9', place: '#E9ECF0', placeMinor: '#B6BEC9', waterLabel: '#5D8BA6', boundary: '#3A414C', house: '#7C8591',
  },
  light: {
    bg: '#EEF2F5', water: '#A9D3EA', waterLine: '#8FC3E0', park: '#CDE8C8', parkLine: '#B5DDB0',
    landuse: '#E6EBEF', building: '#DCE3EA', buildingLine: '#CBD4DD',
    casing: '#CDD6DF', minor: '#FFFFFF', major: '#FFFFFF', motorway: '#FFE7B8', path: '#DCE3EA', rail: '#B9C4CF',
    roadLabel: '#24384D', roadLabelMinor: '#4F6478', halo: '#FFFFFF',
    poi: '#4F6478', place: '#0E2A47', placeMinor: '#3D5268', waterLabel: '#3F7899', boundary: '#AAB6C2', house: '#7A8A9A',
  },
};

let basePromise = null;

function loadBase() {
  if (!basePromise) {
    basePromise = fetch(CONFIG.styles.base)
      .then((r) => { if (!r.ok) throw new Error(`estilo ${r.status}`); return r.json(); })
      .catch((err) => { basePromise = null; throw err; });
  }
  return basePromise;
}

const zoomSize = (stops) => ['interpolate', ['linear'], ['zoom'], ...stops.flat()];

function setPaint(l, prop, value) { l.paint = l.paint || {}; l.paint[prop] = value; }

/** Estilo de partida enquanto o completo carrega (só o fundo). */
export function placeholderStyle(theme) {
  return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': PALETTE[theme].bg } }] };
}

export async function buildStyle(theme) {
  const base = await loadBase();
  const s = JSON.parse(JSON.stringify(base));
  const c = PALETTE[theme];
  let font = null;
  let vectorSource = null;

  for (const l of s.layers) {
    const sl = l['source-layer'] || '';
    const id = l.id || '';
    l.paint = l.paint || {};
    l.layout = l.layout || {};
    if (l.source && s.sources[l.source]?.type === 'vector') vectorSource = vectorSource || l.source;

    switch (l.type) {
      case 'background':
        setPaint(l, 'background-color', c.bg);
        break;

      case 'fill':
        if (l.paint['fill-pattern']) break;
        if (sl === 'water') setPaint(l, 'fill-color', c.water);
        else if (sl === 'park' || (sl === 'landcover' && /wood|grass|park|forest|scrub/.test(id))) { setPaint(l, 'fill-color', c.park); setPaint(l, 'fill-opacity', 1); }
        else if (sl === 'landcover') setPaint(l, 'fill-color', c.landuse);
        else if (sl === 'landuse') setPaint(l, 'fill-color', c.landuse);
        else if (sl === 'building') { setPaint(l, 'fill-color', c.building); setPaint(l, 'fill-outline-color', c.buildingLine); }
        else if (sl === 'aeroway') setPaint(l, 'fill-color', c.landuse);
        break;

      case 'fill-extrusion':
        setPaint(l, 'fill-extrusion-color', c.building);
        break;

      case 'line':
        if (l.paint['line-pattern']) break;
        if (sl === 'transportation') {
          let col;
          if (/rail|transit|subway|tram/.test(id)) col = c.rail;
          else if (/path|pedestrian|track|footway|cycle/.test(id)) col = c.path;
          else if (/casing/.test(id)) col = c.casing;
          else if (/motorway/.test(id)) col = c.motorway;
          else if (/trunk|primary|secondary|tertiary|major/.test(id)) col = c.major;
          else col = c.minor;
          setPaint(l, 'line-color', col);
        } else if (sl === 'waterway') setPaint(l, 'line-color', c.waterLine);
        else if (sl === 'boundary') setPaint(l, 'line-color', c.boundary);
        else if (sl === 'park') setPaint(l, 'line-color', c.parkLine);
        break;

      case 'symbol': {
        if (!l.layout['text-field']) break;
        font = font || l.layout['text-font'];
        const halo = () => { setPaint(l, 'text-halo-color', c.halo); setPaint(l, 'text-halo-width', 1.6); setPaint(l, 'text-halo-blur', 0.4); };

        if (sl === 'transportation_name') {
          if (l.layout['icon-image']) break; // escudos de rodovia: mantém o visual original
          const minor = /minor|path|service|track/.test(id);
          const path = /path/.test(id);
          // nomes aparecem mais cedo e maiores
          l.minzoom = Math.min(l.minzoom ?? 13, path ? 15 : minor ? 13.5 : 11);
          l.layout['text-size'] = minor
            ? zoomSize([[13.5, 10.5], [15, 12], [17, 14], [19, 16]])
            : zoomSize([[11, 11], [14, 13], [16, 15], [19, 18]]);
          if (l.layout['symbol-placement'] === 'line') l.layout['symbol-spacing'] = 220;
          setPaint(l, 'text-color', minor ? c.roadLabelMinor : c.roadLabel);
          halo();
        } else if (sl === 'poi') {
          l.minzoom = Math.max(13, (l.minzoom ?? 15) - 1.5);
          setPaint(l, 'text-color', c.poi);
          halo();
        } else if (sl === 'place') {
          setPaint(l, 'text-color', /city|capital|country|state/.test(id) ? c.place : c.placeMinor);
          halo();
        } else if (sl === 'water_name' || sl === 'waterway') {
          setPaint(l, 'text-color', c.waterLabel);
          halo();
        } else {
          setPaint(l, 'text-color', c.poi);
          halo();
        }
        break;
      }
      default:
    }
  }

  // Números das casas em zoom alto (se o estilo base não tiver).
  const hasHouse = s.layers.some((l) => l['source-layer'] === 'housenumber');
  if (!hasHouse && vectorSource && font) {
    const firstPoi = s.layers.findIndex((l) => l['source-layer'] === 'poi');
    const layer = {
      id: 'mm-housenumber', type: 'symbol', source: vectorSource, 'source-layer': 'housenumber', minzoom: 17,
      layout: { 'text-field': ['to-string', ['get', 'housenumber']], 'text-font': font, 'text-size': 10, 'text-padding': 2 },
      paint: { 'text-color': c.house, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    };
    s.layers.splice(firstPoi >= 0 ? firstPoi : s.layers.length, 0, layer);
  }
  return s;
}
