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

## Testes

Testes automáticos com o executor nativo do Node.js (`node --test`), **sem instalar nada**:
nenhuma dependência, nenhum `npm install`. O `package.json` existe só para o comando `npm test`.

**Requisito:** Node.js 22 ou mais novo (`node --version`).

```bash
cd meu-mapa
npm test                                   # todos os testes
node --test "tests/**/*.test.js"           # o mesmo, sem npm
node --test tests/geocoder.test.js         # um arquivo só
node --test --test-reporter=spec "tests/**/*.test.js"   # saída mais legível
```

Os testes nunca acessam a internet: o `fetch` é trocado por respostas simuladas (`tests/helpers.js`).

| Arquivo | O que verifica |
|---|---|
| `tests/fetch.test.js` | tempo máximo das chamadas, cancelamento, erros HTTP e de conexão |
| `tests/geocoder.test.js` | busca: ordem por proximidade, duas consultas ao Photon, falhas e cancelamento |
| `tests/routing.test.js` | instruções em português, paradas, cache e mensagens de erro do OSRM |
| `tests/places.test.js` | junção de resultados por categoria, servidores reserva do Overpass, detalhes do lugar (inclusive links seguros) |
| `tests/map3d.test.js` | modo 3D: o que ligar (inclusive bateria fraca), parede da rota, prédio do destino e desenho das setas 3D |
| `tests/junction.test.js` | faixas, setas de faixa e visão da junção em movimento: geometria, movimento pela distância (inclusive nomes com HTML escapados) |
| `tests/hours.test.js` | horário de funcionamento: aberto/fechado, madrugada, formatos não entendidos |
| `tests/settings.test.js` | preferências e abreviações (R., Av., Dr.…) |
| `tests/format.test.js`, `tests/geo.test.js` | distâncias, tempos e geometria da navegação |
| `tests/project.test.js` | consistência: todo módulo está no cache offline do `sw.js`, versões iguais, arquivos e imports existentes |

Ao criar um módulo novo em `js/`, coloque-o também no `SHELL` do `sw.js` (o teste avisa se esquecer).
Ao publicar uma versão, suba `VERSION` no `sw.js` e `version` no `js/config.js` juntos (o teste confere).

## O que já faz
- Visual próprio: tema escuro (limão) e claro (azul-marinho + coral), seguindo o sistema ou escolhido em Ajustes
- Topo em estilo de sinalização de trânsito nas rotas e na navegação
- Mapa com estilo próprio nos dois temas: avenidas em maiúsculas espaçadas, bairros espaçados, escudo de rodovia, nomes mais cedo e maiores, números das casas (`js/mapstyle.js`)
- Ícones próprios no estilo "Placa" (desenhados pelo app, `js/mapicons.js`): cor por grupo de categoria, pontinhos de longe e placa com nome de perto
- Sua localização com **cone de direção** (bússola do celular; no iPhone a permissão é pedida ao tocar no botão de localização)
- Busca com autocompletar, salvos e recentes, **priorizando o que está perto**: duas consultas em paralelo (geral e num raio de ~30 km), e o que tem o nome digitado aparece do mais perto para o mais longe, com a distância na lista; cidade/bairro com o nome exato e buscas bem específicas (ex.: endereço com número) mantêm a ordem normal
- Digitar "mercado", "farmácia", "posto", "padaria"… mostra o atalho "… perto de você", que abre a lista da categoria
- Categorias rápidas (Comida, Café, Combustível, Farmácia, Mercado): resultados instantâneos dos pontos do próprio mapa + busca completa no OpenStreetMap (várias etiquetas por categoria, servidores reserva, raio ampliado para 5 km se vier pouca coisa, cache de 5 min)
- Card do lugar com tempo de carro, distância e chegada, e detalhes do OpenStreetMap: endereço, aberto/fechado agora e horários da semana, telefone, WhatsApp, site, Instagram, comodidades e combustíveis, com link para sugerir edição (`js/details.js`, `js/hours.js`)
- Toque longo (ou clique direito): "Rotas até aqui", "Sair daqui", "O que tem aqui?"
- Rotas de carro, bike e a pé, com alternativas e passo a passo em português
- **Partida, chegada e até 3 paradas**: toque em DE/PARA ou em "+ Adicionar parada" e busque ou toque no mapa; também pelo toque longo ("Adicionar como parada"); inverter inverte a viagem toda
- **Navegação**: câmera em perspectiva seguindo você, placa da próxima manobra, faixa "Depois",
  trecho já percorrido em cinza, **zoom dinâmico** (contínuo pela velocidade, tabela em `CONFIG.nav.zoomBySpeed`; aproxima perto das manobras),
  **faixas** (barra a até ~800 m e **visão da junção em movimento** em pontos confusos, a partir dos dados de faixa do OSM: as faixas andam na sua velocidade real, a faixa certa acende, as outras apagam e a vista acompanha a curva), tempo/distância restantes, velocidade, recálculo automático fora da rota, voz em português,
  tela sempre ligada e visão geral/recentralizar
- **Simular viagem** (menu ⋯ durante a navegação): percorre a rota sozinho, para testar sem sair de casa.
  Se a partida não for sua localização, o Iniciar já abre em modo simulação.
  A velocidade segue a prevista pelo servidor de rotas para cada trecho (mais rápido em avenidas e rodovias,
  mais devagar em ruas locais), freando antes das curvas e da chegada.
  No mesmo menu, "Velocidade da simulação" alterna 1×, 2× e 4× para testar trajetos longos mais rápido.
- **Ajustes** (botão ao lado da busca): tema automático/claro/escuro, abreviar nomes na placa (R., Av., Serv., Dr.…), voz, recolher o painel sozinho
- Setas de manobra próprias (`js/maneuvers.js`) e placa com a distância embaixo da seta
- **Modo 3D** (Ajustes › Visual do mapa, ou o botão 2D/3D no mapa e na navegação). O padrão continua plano. Cada parte liga separada:
  - prédios com a altura do OpenStreetMap;
  - relevo com sombreamento (dados abertos do Mapterhorn; usa mais dados móveis);
  - céu no horizonte;
  - prédio do lugar/destino em destaque na cor do app;
  - rota em 3D (parede de luz);
  - seta da navegação: bolinha de sempre, **A** (seta 3D estilo Waze) ou **B** (bolinha 3D com a setinha);
  - volta sozinho ao plano com a bateria abaixo de 20% fora da tomada (onde o navegador informa a bateria).
- Painel arrastável no celular em pé; **celular deitado (suporte no carro)** usa uma coluna compacta à esquerda e deixa o mapa livre à direita, inclusive na navegação; coluna lateral também no desktop; instalável (PWA)
  - Na tela de rotas deitado, a coluna inteira rola (placa, modos e rotas) e o Iniciar fica sempre preso embaixo; tempos longos aparecem curtos nos botões de modo ("24h45")
- Categorias com as bordas esmaecidas quando há mais itens para rolar; campos DE/PARA com cara de botão (fundo, borda e lápis)

## Estrutura

```
index.html            casco da página
css/app.css           tema (variáveis CSS), layout responsivo
js/config.js          provedores, tempos máximos, categorias e layout: troque aqui
js/core.js            barramento de eventos (bus), estado global, storage, helpers de DOM, fetchJSON
js/map.js             tudo que toca o MapLibre (camadas, marcadores, câmera, gestos)
js/geocoder.js        busca/geocodificação reversa (Photon) → formato Place
js/routing.js         rotas (OSRM) + gerador de instruções em pt-BR
js/sheet.js           bottom sheet arrastável
js/nav.js             modo navegação (GPS/simulação, manobras, voz, recálculo, zoom dinâmico)
js/junction.js        faixas: análise, setas de faixa e visão da junção em movimento (CSS 3D)
js/geo.js             geometria: distâncias, projeção na rota
js/location.js        GPS do usuário
js/places.js          categorias próximas (blocos do mapa + Overpass com servidores reserva)
js/details.js         detalhes do lugar (etiquetas do OSM: contato, horário, comodidades)
js/hours.js           horário de funcionamento (opening_hours)
js/mapstyle.js        estilo do mapa (cores, densidade de nomes, números)
js/compass.js         bússola do aparelho
js/maneuvers.js       setas de manobra (haste + ponta sólida)
js/map3d.js           modo 3D: o que ligar, parede da rota, prédio do destino, setas 3D (lógica pura)
js/mapicons.js        ícones do mapa desenhados no app (estilo "Placa")
js/icons.js           ícones de traço da interface
js/format.js          distância, tempo e horário em pt-BR
js/settings.js        preferências e abreviação de nomes de ruas
js/search-ui.js       caixa de busca, recentes, teclado
js/views.js           renderização das telas do painel
js/main.js            controlador: liga tudo
sw.js                 service worker (cache do app, não dos mapas)
tests/                testes automáticos (node --test)
package.json          só para `npm test`; não há dependências nem build
```

### Eventos do `bus`
- Mapa: `map:ready`, `map:click`, `map:longpress`, `map:userpan`, `map:rotate`
- Localização: `position`, `position:error`, `heading`
- Busca e telas: `place:chosen`, `search:cleared`, `pick:cancel`, `category:open`, `route:select`
- Navegação: `nav:rerouted`, `nav:ended`
- Ajustes: `settings:changed`, `map3d:changed`

Novas funcionalidades devem escutar/emitir eventos em vez de importar umas às outras.
No console: `meuMapa.state`, `meuMapa.map()`, `meuMapa.bus`.

## Provedores (todos gratuitos, com uso justo)
| Função | Serviço | Observação |
|---|---|---|
| Mapa (claro e escuro) | OpenFreeMap (base `liberty`, recolorida) | Sem limite declarado, sem chave |
| Busca | Photon (Komoot) | Não usar para tráfego pesado |
| Categorias | Overpass API | Uso justo, sem chave |
| Rotas | OSRM da FOSSGIS (routing.openstreetmap.de) | Servidor de demonstração; para escala, subir o próprio |

Cada chamada tem tempo máximo (`timeoutMs` em `js/config.js`): busca e endereço 8 s, rotas 15 s,
estilo do mapa 10 s (sem resposta, o mapa usa o estilo original do provedor) e Overpass 12 s por servidor.
Se o servidor não responder a tempo, o app mostra uma mensagem e permite tentar de novo.

## Segurança
- Nomes e textos vindos do OpenStreetMap entram na tela sempre como texto (nunca como HTML).
- Links de sites dos lugares são sempre `https://` (um valor como `javascript:` vira um endereço inofensivo).
- Não há chaves, senhas nem backend; preferências, salvos e recentes ficam só no aparelho.
- **Integridade do MapLibre (SRI) — ainda não ativada.** Foi testada com um servidor de teste: funciona online,
  pelo service worker e offline, e bloqueia um arquivo adulterado. Falta só o valor real do arquivo do unpkg,
  que não pôde ser baixado no ambiente onde o projeto foi preparado. Para ativar:
  1. Gere os dois valores (precisa de internet):
     ```bash
     curl -s https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js  | openssl dgst -sha384 -binary | openssl base64 -A
     curl -s https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css | openssl dgst -sha384 -binary | openssl base64 -A
     ```
  2. No `index.html`, acrescente nas duas tags do MapLibre `integrity="sha384-VALOR"` **e** `crossorigin="anonymous"`
     (sem o `crossorigin` o navegador bloqueia o arquivo).
  3. Suba a versão (`sw.js` e `config.js`) e confira o app online e offline. Um valor errado impede o app de abrir.

Quando quiser mexer nos "pesos" das ruas (evitar morros, priorizar ciclovias, penalizar trechos), o caminho é subir seu próprio **OSRM**, **Valhalla** ou **GraphHopper** com o recorte do OSM da sua região e apontar `config.js` para ele.
