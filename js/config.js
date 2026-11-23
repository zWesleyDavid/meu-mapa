// Configuração central. Troque provedores aqui sem mexer no resto do código.
export const CONFIG = {
  appName: 'Meu Mapa',
  version: '26',  // suba junto com o VERSION do sw.js

  // Vista inicial antes de achar sua localização (Brasil inteiro).
  initialView: { center: [-51.9, -14.2], zoom: 3.6 },

  // Estilo do mapa: base vetorial do OpenFreeMap (sem chave). As cores e a densidade de
  // nomes de ruas/pontos são ajustadas em js/mapstyle.js para os dois temas.
  styles: {
    base: 'https://tiles.openfreemap.org/styles/liberty',
    timeoutMs: 10000,    // sem resposta: o mapa usa o estilo original do provedor
  },

  // Busca de endereços (Photon / Komoot, baseado no OpenStreetMap).
  geocoder: {
    search: 'https://photon.komoot.io/api/',
    reverse: 'https://photon.komoot.io/reverse',
    limit: 12,           // por consulta (são duas: geral e perto de você)
    show: 10,            // quantos resultados aparecem na lista
    nearKm: 30,          // raio da consulta "perto de você"
    biasZoom: 12,        // raio do viés de localização do Photon (≈ zoom do mapa)
    biasScale: 0.15,     // 0 = só distância, 1 = fama do lugar pesa igual
    debounceMs: 250,
    timeoutMs: 8000,     // tempo máximo de cada consulta (busca e endereço)
    // Idioma dos nomes: o Photon não tem português e, sem isto, segue o navegador e cai no
    // inglês ("São Paulo Museum of Art", "Spain"). "default" = nome local (no Brasil, português).
    lang: 'default',
  },

  // Rotas: servidores OSRM públicos da FOSSGIS (os mesmos usados no openstreetmap.org).
  // Uso justo: não é para produção pesada. Quando quiser controlar os "pesos",
  // suba seu próprio OSRM/Valhalla e troque as URLs abaixo.
  routing: {
    profiles: {
      car:  { label: 'Carro', url: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',  simSpeed: 13, sim: { min: 4, max: 30, turn: 7 } },
      bike: { label: 'Bike',  url: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/', simSpeed: 5.5, sim: { min: 2, max: 8, turn: 3 } },
      foot: { label: 'A pé',  url: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/', simSpeed: 3, sim: { min: 1, max: 1.8, turn: 1.2 } },
    },
    defaultProfile: 'car',
    timeoutMs: 15000,    // rotas longas podem levar alguns segundos
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
    { id: 'food', label: 'Comida', icon: 'food', kind: 'Restaurante', plural: 'Restaurantes e lanchonetes',
      words: ['comida', 'restaurante', 'restaurantes', 'lanchonete', 'lanchonetes', 'lanche', 'almoco', 'jantar'],
      tags: ['["amenity"~"^(restaurant|fast_food|food_court)$"]'],
      tileClasses: ['restaurant', 'fast_food', 'food_court'] },
    { id: 'cafe', label: 'Café', icon: 'cafe', kind: 'Café', plural: 'Cafés e padarias',
      words: ['cafe', 'cafes', 'cafeteria', 'cafeterias', 'padaria', 'padarias', 'confeitaria'],
      tags: ['["amenity"="cafe"]', '["shop"~"^(coffee|bakery|pastry)$"]'],
      tileClasses: ['cafe', 'bakery', 'coffee', 'pastry'] },
    { id: 'fuel', label: 'Combustível', icon: 'fuel', kind: 'Posto', plural: 'Postos de combustível',
      words: ['posto', 'postos', 'gasolina', 'combustivel', 'etanol', 'alcool', 'diesel', 'posto gasolina', 'posto combustivel'],
      tags: ['["amenity"="fuel"]'],
      tileClasses: ['fuel'] },
    { id: 'pharmacy', label: 'Farmácia', icon: 'pharmacy', kind: 'Farmácia', plural: 'Farmácias',
      words: ['farmacia', 'farmacias', 'drogaria', 'drogarias', 'remedio'],
      tags: ['["amenity"="pharmacy"]', '["shop"="chemist"]', '["healthcare"="pharmacy"]'],
      tileClasses: ['pharmacy', 'chemist'] },
    { id: 'shop', label: 'Mercado', icon: 'cart', kind: 'Mercado', plural: 'Mercados',
      words: ['mercado', 'mercados', 'supermercado', 'supermercados', 'mercadinho', 'mercearia', 'hortifruti', 'conveniencia', 'atacado', 'atacadista'],
      tags: ['["shop"~"^(supermarket|convenience|greengrocer|wholesale)$"]'],
      tileClasses: ['supermarket', 'convenience', 'greengrocer', 'grocery'] },
  ],
  categoryRadius: 2000,      // raio inicial
  categoryRadiusMax: 5000,   // amplia se vier pouca coisa
  categoryMinResults: 8,

  // Modo 3D (Ajustes › Visual do mapa)
  map3d: {
    pitch: 50,                 // inclinação do mapa fora da navegação no modo 3D
    // relevo: dados de altitude abertos e gratuitos (os mesmos do exemplo oficial do MapLibre)
    // Declarado aqui (e não pelo tilejson.json) porque o tilejson não informa o zoom máximo:
    // o MapLibre pedia até o zoom 22, e no Brasil só existem blocos até o 12 → centenas de
    // pedidos com erro 404 por minuto em 3D. Acima de 12 o MapLibre amplia o bloco 12.
    terrain: {
      tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
      encoding: 'terrarium', tileSize: 512, maxzoom: 12,
      attribution: "<a href='https://mapterhorn.com/attribution'>© Mapterhorn</a>",
    },
    exaggeration: 1.3,         // exagero do relevo (1 = real)
    destMinZoom: 15,           // abaixo disso os prédios nem aparecem no mapa
  },

  // Layout: as mesmas condições estão nos @media do css/app.css (CSS não lê variáveis
  // em media queries). Se mudar aqui, mude lá também.
  layout: {
    column: '(min-width: 900px) and (min-height: 561px), (orientation: landscape) and (max-height: 560px)', // painel em coluna
    landscapePhone: '(orientation: landscape) and (max-height: 560px)', // celular deitado (suporte no carro)
  },

  // Navegação
  nav: {
    offRouteMeters: 45,      // distância da rota para considerar "fora da rota"
    offRouteFixes: 3,        // leituras seguidas fora da rota antes de recalcular
    arriveMeters: 25,
    pitch: 55,
    // zoom da câmera conforme a velocidade: [km/h, zoom]; entre os pontos o zoom é interpolado
    // (sem degraus, para não ficar alternando quando a velocidade oscila perto de um limite)
    zoomBySpeed: [[35, 16.9], [60, 16.2], [80, 16.0], [100, 15.6], [120, 15.2]],
  },

  recentLimit: 8,
};
