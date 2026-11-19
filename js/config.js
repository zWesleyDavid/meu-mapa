// Configuração central. Troque provedores aqui sem mexer no resto do código.
export const CONFIG = {
  appName: 'Meu Mapa',
  version: '13',  // suba junto com o VERSION do sw.js

  // Vista inicial antes de achar sua localização (Brasil inteiro).
  initialView: { center: [-51.9, -14.2], zoom: 3.6 },

  // Estilo do mapa: base vetorial do OpenFreeMap (sem chave). As cores e a densidade de
  // nomes de ruas/pontos são ajustadas em js/mapstyle.js para os dois temas.
  styles: {
    base: 'https://tiles.openfreemap.org/styles/liberty',
  },

  // Busca de endereços (Photon / Komoot, baseado no OpenStreetMap).
  geocoder: {
    search: 'https://photon.komoot.io/api/',
    reverse: 'https://photon.komoot.io/reverse',
    limit: 8,
    debounceMs: 250,
  },

  // Rotas: servidores OSRM públicos da FOSSGIS (os mesmos usados no openstreetmap.org).
  // Uso justo: não é para produção pesada. Quando quiser controlar os "pesos",
  // suba seu próprio OSRM/Valhalla e troque as URLs abaixo.
  routing: {
    profiles: {
      car:  { label: 'Carro', url: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',  simSpeed: 13 },
      bike: { label: 'Bike',  url: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/', simSpeed: 5.5 },
      foot: { label: 'A pé',  url: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/', simSpeed: 3 },
    },
    defaultProfile: 'car',
  },

  // Categorias rápidas. Duas fontes, combinadas:
  //  1) os pontos que já vieram nos blocos do mapa (instantâneo, sem rede extra)
  //  2) Overpass / OpenStreetMap (completo), com servidores reserva se o primeiro demorar
  overpass: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ],
  overpassHedgeMs: 2500,   // espera antes de tentar o próximo servidor
  overpassTimeoutMs: 12000,
  categories: [
    { id: 'food', label: 'Comida', icon: 'food', kind: 'Restaurante',
      tags: ['["amenity"~"^(restaurant|fast_food|food_court)$"]'],
      tileClasses: ['restaurant', 'fast_food', 'food_court'] },
    { id: 'cafe', label: 'Café', icon: 'cafe', kind: 'Café',
      tags: ['["amenity"="cafe"]', '["shop"~"^(coffee|bakery|pastry)$"]'],
      tileClasses: ['cafe', 'bakery', 'coffee', 'pastry'] },
    { id: 'fuel', label: 'Combustível', icon: 'fuel', kind: 'Posto',
      tags: ['["amenity"="fuel"]'],
      tileClasses: ['fuel'] },
    { id: 'pharmacy', label: 'Farmácia', icon: 'pharmacy', kind: 'Farmácia',
      tags: ['["amenity"="pharmacy"]', '["shop"="chemist"]', '["healthcare"="pharmacy"]'],
      tileClasses: ['pharmacy', 'chemist'] },
  ],
  categoryRadius: 2000,      // raio inicial
  categoryRadiusMax: 5000,   // amplia se vier pouca coisa
  categoryMinResults: 8,

  // Navegação
  nav: {
    offRouteMeters: 45,      // distância da rota para considerar "fora da rota"
    offRouteFixes: 3,        // leituras seguidas fora da rota antes de recalcular
    arriveMeters: 25,
    pitch: 55,
  },

  recentLimit: 8,
};
