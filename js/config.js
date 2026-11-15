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
      car:  { label: 'Carro',  url: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' },
      bike: { label: 'Bike',   url: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/' },
      foot: { label: 'A pé',   url: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/' },
    },
    defaultProfile: 'car',
  },

  recentLimit: 8,
};
