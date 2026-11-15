// Configuração central. Troque provedores aqui sem mexer no resto do código.
export const CONFIG = {
  appName: 'Meu Mapa',

  // Vista inicial antes de achar sua localização (Brasil inteiro).
  initialView: { center: [-51.9, -14.2], zoom: 3.6 },

  // Estilos do mapa (vetoriais, sem chave de API).
  styles: {
    light: 'https://tiles.openfreemap.org/styles/liberty',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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

  // Categorias rápidas (busca de pontos próximos via Overpass / OpenStreetMap).
  overpass: 'https://overpass-api.de/api/interpreter',
  categories: [
    { id: 'food',     label: 'Comida',      icon: 'food',     kind: 'Restaurante', filter: '["amenity"~"^(restaurant|fast_food)$"]' },
    { id: 'cafe',     label: 'Café',        icon: 'cafe',     kind: 'Café',        filter: '["amenity"="cafe"]' },
    { id: 'fuel',     label: 'Combustível', icon: 'fuel',     kind: 'Posto',       filter: '["amenity"="fuel"]' },
    { id: 'pharmacy', label: 'Farmácia',    icon: 'pharmacy', kind: 'Farmácia',    filter: '["amenity"="pharmacy"]' },
  ],
  categoryRadius: 2000,

  // Navegação
  nav: {
    offRouteMeters: 45,      // distância da rota para considerar "fora da rota"
    offRouteFixes: 3,        // leituras seguidas fora da rota antes de recalcular
    arriveMeters: 25,
    pitch: 55,
  },

  recentLimit: 8,
};
