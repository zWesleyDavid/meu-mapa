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
- Mapa vetorial com tema claro/escuro (segue o sistema; botão para alternar)
- Sua localização com direção (bússola)
- Busca com autocompletar, priorizando resultados perto de você, e histórico de recentes
- Toque num ponto de interesse do mapa para ver detalhes
- Toque longo (ou clique direito): "Rotas até aqui", "Sair daqui", "O que tem aqui?"
- Rotas de carro, bike e a pé, com o tempo de cada modo, rotas alternativas (toque na linha cinza ou no card) e passo a passo em português
- Painel arrastável no celular (3 alturas) e painel lateral em telas largas
- Instalável (manifest + service worker)

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
| Mapa claro | OpenFreeMap (`liberty`) | Sem limite declarado, sem chave |
| Mapa escuro | CARTO Dark Matter | Grátis para uso não comercial |
| Busca | Photon (Komoot) | Não usar para tráfego pesado |
| Rotas | OSRM da FOSSGIS (routing.openstreetmap.de) | Servidor de demonstração; para escala, subir o próprio |

Quando quiser mexer nos "pesos" das ruas (evitar morros, priorizar ciclovias, penalizar trechos), o caminho é subir seu próprio **OSRM**, **Valhalla** ou **GraphHopper** com o recorte do OSM da sua região e apontar `config.js` para ele.
