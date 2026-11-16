# Meu Mapa

PWA de mapas e rotas, sem build e sem chave de API. JavaScript puro (ES modules) + MapLibre GL.

## Rodar localmente

```bash
cd meu-mapa
npx serve .            # ou: python3 -m http.server 8080
```

Abra `http://localhost:3000` (ou a porta indicada). A localização só funciona em **https** ou **localhost**.

### Testar no celular
Precisa de https. As formas mais rápidas:
- **Netlify Drop**: arraste a pasta em https://app.netlify.com/drop
- **GitHub Pages / Vercel / Cloudflare Pages**: publique a pasta como site estático
- **Túnel** a partir do seu PC: `npx localtunnel --port 3000` ou `cloudflared tunnel --url http://localhost:3000`

No celular, use "Adicionar à tela inicial" para instalar como app.

## O que já faz
- Visual próprio: tema escuro (limão) e claro (azul-marinho + coral), seguindo o sistema ou pelo botão
- Topo em estilo de sinalização de trânsito nas rotas e na navegação
- Mapa com estilo próprio nos dois temas: nomes de ruas e avenidas mais cedo e maiores, mais pontos de interesse e números das casas em zoom alto (`js/mapstyle.js`)
- Sua localização com **cone de direção** (bússola do celular; no iPhone a permissão é pedida ao tocar no botão de localização)
- Busca com autocompletar, salvos e recentes
- Categorias rápidas (Comida, Café, Combustível, Farmácia) num raio de 2 km
- Card do lugar com tempo de carro, distância e horário de chegada
- Toque longo (ou clique direito): "Rotas até aqui", "Sair daqui", "O que tem aqui?"
- Rotas de carro, bike e a pé, com alternativas e passo a passo em português
- **Navegação**: câmera em perspectiva seguindo você, placa da próxima manobra, faixa "Depois",
  trecho já percorrido em cinza, tempo/distância restantes, velocidade, recálculo automático fora da rota, voz em português,
  tela sempre ligada e visão geral/recentralizar
- **Simular viagem** (menu ⋯ durante a navegação): percorre a rota sozinho, para testar sem sair de casa.
  Se a partida não for sua localização, o Iniciar já abre em modo simulação.
- Painel arrastável no celular e coluna lateral em telas largas; instalável (PWA)

## Estrutura

```
index.html            casco da página
css/app.css           tema (variáveis CSS), layout responsivo
js/config.js          provedores de mapa, busca e rotas: troque aqui
js/core.js            barramento de eventos (bus), estado global, storage, helpers de DOM
js/map.js             tudo que toca o MapLibre (camadas, marcadores, câmera, gestos)
js/geocoder.js        busca/geocodificação reversa (Photon) → formato Place
js/routing.js         rotas (OSRM) + gerador de instruções em pt-BR
js/sheet.js           bottom sheet arrastável
js/nav.js             modo navegação (GPS/simulação, manobras, voz, recálculo)
js/geo.js             geometria: distâncias, projeção na rota
js/location.js        GPS do usuário
js/places.js          categorias próximas (Overpass)
js/mapstyle.js        estilo do mapa (cores, densidade de nomes, números)
js/compass.js         bússola do aparelho
js/search-ui.js       caixa de busca, recentes, teclado
js/views.js           renderização das telas do painel
js/main.js            controlador: liga tudo
sw.js                 service worker (cache do app, não dos mapas)
```

### Eventos do `bus`
`map:ready`, `map:click`, `map:longpress`, `map:userpan`, `position`, `position:error`,
`place:chosen`, `search:cleared`, `route:select`.
Novas funcionalidades devem escutar/emitir eventos em vez de importar umas às outras.
No console: `meuMapa.state`, `meuMapa.map()`, `meuMapa.bus`.

## Provedores (todos gratuitos, com uso justo)
| Função | Serviço | Observação |
|---|---|---|
| Mapa (claro e escuro) | OpenFreeMap (base `liberty`, recolorida) | Sem limite declarado, sem chave |
| Busca | Photon (Komoot) | Não usar para tráfego pesado |
| Categorias | Overpass API | Uso justo, sem chave |
| Rotas | OSRM da FOSSGIS (routing.openstreetmap.de) | Servidor de demonstração; para escala, subir o próprio |

Quando quiser mexer nos "pesos" das ruas (evitar morros, priorizar ciclovias, penalizar trechos), o caminho é subir seu próprio **OSRM**, **Valhalla** ou **GraphHopper** com o recorte do OSM da sua região e apontar `config.js` para ele.
