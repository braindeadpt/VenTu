# Maquete v7 «Porta do mapa»: a home é a porta e o /mapa ganha a pele v6

> **Cópia no repo (20 out 2026, aprovada pelo Pedro).** Contrato da fase A: issue «Home v7: porta do mapa (fase A)».
> Nesta pasta vão só `home.html`, `mapa.html`, `lib/`, `img/poster-*.webp` e as capturas da **home** (fase A).
> As capturas do /mapa com a pele v6, os fotogramas da transição e o `_build/` (gerador, dados inventados) ficam fora do repo: são da fase B, que terá issue própria.
> As fotos vêm de `../v6-atlantico/fotos/` (na maquete original era `../maquete-v6/fotos/`).
> **Atenção:** `img/poster-*.webp` tem rótulos, notas, mar colorido e traços de vento **inventados** cozidos na imagem. É referência visual, não é um asset de produção.

20 out 2026. **Só maquete** (HTML estático). Não houve alterações ao repo, não houve PR nem build.
Parte de `../analise-mapa-home/relatorio.md` (diagnóstico), `../maquete-v6/` (linguagem «Atlântico» aprovada), `/tmp/vt/VenTu-main` (código real do /mapa: `MapaFullscreenClient`, `src/components/spots/map/**`, `Header.tsx`, traduções `mapUi/*`) e `docs/pr-183/cabecalho.md`.

**Decisão de partida:** o /mapa actual (Leaflet) **fica, com todas as funcionalidades**. Esta maquete muda só a porta (home e cabeçalho) e o visual do /mapa.

## Abrir
- `home.html` (home v7) e `mapa.html` (/mapa com a pele v6). Abrem directamente do disco. As fontes, o Leaflet 1.9.4 e o markercluster 1.5.3 estão em `lib/`. As fotos vêm de `../maquete-v6/fotos/`. O mosaico de base vem em directo do Esri.
- Parâmetros da home: `?d=kite|surf`, `?b=…` (como na v6), `?estado=hov|press` (estados do cartão) e `?menu=1` (gaveta aberta no telemóvel).
- Parâmetros do /mapa: são os mesmos do /mapa real (`?sport=`, `?wind=1|0`, `?t=0..23`, `?lat&lon&z`), mais `?dia=1` (**novo**, ver «Decisões»), `?estado=spot&spot=guincho`, `?estado=camadas` e `?estado=nu` (sem painéis, usado só nos fotogramas).
- Dados: `_build/dados.json` (gerado por `_build/gen_dados.js`). Os 185 spots reais (nomes, regiões, coordenadas, modalidades e nível) vêm de `public/data/spots-index.json`. Há 140 de surf e 85 de kite. **As notas são inventadas mas plausíveis**, de dia (qua 14 out, 14h). Os 19 spots da v6 usam **as mesmas notas do núcleo v6**, por isso o Guincho tem 9 na home e 9 no /mapa. Os outros spots herdam a nota do spot v6 mais próximo, com ruído determinístico.

## Ecrãs (`capturas/`, 390×844 a DPR 2 e 1440×900, só viewport)
| Ficheiro | O quê |
|---|---|
| `home-1440.png` | Home: cartão do mapa = **imagem estática do próprio mapa** (WebP de 31 KB) + CTA «Explorar o mapa da costa →». O cartão inteiro é um link. «Mapa da costa» passa a item de 1.º nível no cabeçalho |
| `home-1440-hover.png` | Cartão em hover: anel amarelo, imagem a 1,035× e a seta avança |
| `home-390-topo.png` | 1.º ecrã no telemóvel: ícone do mapa (com ponto gelo) ao lado da lupa |
| `home-390-faixa.png` | A faixa é uma entrada única para /mapa. Sai o «Abrir mapa» (o diálogo) e sai o «Mapa da costa» duplicado do rodapé. O chip do vento passa para debaixo do título |
| `home-390-menu.png` | Gaveta: «Mapa da costa» no topo, em destaque, fora de «Condições». Idioma, tema e «Entrar» ficam onde estavam |
| `mapa-1440.png` | /mapa à chegada da home: Kitesurf, hoje 14h, vento ligado, régua de 48 h aberta |
| `mapa-1440-camadas.png` | Menu Camadas aberto (Base / Tempo / Mar / Navegação + Tempestades e Áreas IPMA) |
| `mapa-1440-spot.png` | Spot aberto (Guincho): nota 9/10 Muito bom, frase v6, métricas, 48 h, Ver spot e Direcções |
| `mapa-390.png`, `mapa-390-camadas.png`, `mapa-390-spot.png` | O mesmo no telemóvel (folha em baixo) |
| `transicao-1440-{1..4}.png`, `transicao-1440-folha.png` | 4 fotogramas: toque → o cartão cresce → funde no Leaflet → chegada |
| `transicao-390-{1..4}.png`, `transicao-390-folha.png` | O mesmo no telemóvel, a partir da faixa |
| `lado-a-lado-*.png` | Hoje (live, `../analise-mapa-home/`) × v7: home 1440, home 390 (topo e faixa), menu 390, /mapa 1440 e /mapa 390 |

Validação: o `_build/shot.js` verifica overflow horizontal, texto cortado (scrollWidth) e contraste WCAG do texto visível em cada captura. Todas passam. O único aviso é «Kite 1,04», um falso positivo: o texto do botão premido é tinta sobre a pista amarela, que está noutro elemento. Também revi cada PNG a olho.

## Fase A: «a home é a porta»
- **Cartão 1440:** a imagem estática do mapa v6 (câmara de desktop, `img/poster-1440.webp`, 31 KB, `fetchpriority=low`) substitui o gradiente vazio. O MapLibre continua lazy por cima (como no PR #234). O cartão usa um *stretched link* (`.porta-a`) com o mesmo `href` em todos os sítios. A faixa do CTA tem título em Barlow Condensed 900 itálico, a linha «85 spots de kite · vento ao vivo · 48 h» e um círculo amarelo com seta. Os créditos do mapa continuam clicáveis por cima.
- **Faixa 390:** é uma entrada única. O botão e o diálogo «Abrir mapa» desaparecem. O «Mapa da costa» do rodapé sai, porque estava a ~100 px da faixa. «Todos os spots» e «Como lemos a nota» ficam.
- **Cabeçalho:** «Mapa da costa» passa a item de 1.º nível, o primeiro da navegação, com ícone gelo e contorno. No telemóvel é um ícone ao lado da lupa. No /mapa leva `aria-current="page"`. Dentro de «Condições», o item «Mapa» passa a chamar-se «Mapa da costa», o mesmo nome em todo o lado.
- **Chip do vento:** passa para uma segunda linha, debaixo de «MAPA · AGORA». O título já não é cortado.
- **Contexto no link** (actualizado sempre que muda a modalidade ou o bloco): `mapa.html?sport=kitesurf&wind=1&t=14&lat=39.35&lon=-8.95&z=7&de=home` (no telemóvel, z=6.5). Para um bloco de amanhã: `t=10&dia=1`.
- **Transição:** View Transition entre documentos (`@view-transition{navigation:auto}` + `view-transition-name: mapa-costa` no cartão e no contentor do /mapa). Os fotogramas mostram o cartão a crescer em ~140 ms, a ocupar o ecrã em ~300 ms (a imagem 3D funde-se no Leaflet com a mesma costa enquadrada) e a chegada em ~450 ms, com os painéis a entrar. No Firefox é um corte normal.

## Fase B: a pele v6 do /mapa (o Leaflet fica, sem mudança de motor)
- **Base:** mosaico raster (aqui Esri Dark Gray; em produção, o CARTO dark actual) recolorido por **um filtro SVG `feComponentTransfer`** no `tile pane` (`_build/filtro.py`). Cinzentos passam a mar azul `#0E3A5E`, terra ardósia `#111C28` e linhas névoa. Os rótulos vêm numa camada própria a 62 %.
- **Notas:** bandas v6 (Não dá `#A8464A`, Fraco `#4479EE`, Dá `#C99E2A`, Bom `#40DCD0`, **Muito bom `#FFF07A`**) em todos os marcadores, clusters, lista, régua, legenda e painel. **Clusters:** círculo com a melhor nota do grupo, na cor da banda, e «+N» em espuma.
- **Vento:** é o `vento.js` da v6, sem alterações excepto a cor por partícula (gelo → espuma pela força; o comprimento e o brilho também sobem com a força), em canvas sobre o Leaflet (z 450, por baixo dos pins). Os arcos nos pins mantêm-se: offshore gelo, onshore coral, cross névoa.
- **Régua de 48 h** (era o pill «Agora» + scrubber) na linguagem da régua v6: blocos de 3 h com a melhor nota da vista, dias agrupados, selecção com anel de espuma, play e «Agora». A noite aparece como «–» cinzento (regra v6).
- **Cabeçalho e Explorar:** Barlow / Barlow Condensed, tokens abismo, espuma, névoa, sol, gelo e linha `#1E4361`, painéis em vidro escuro, pílulas com selecção a sol.

## Paridade: cada funcionalidade do /mapa actual → onde fica na pele v6
| # | Funcionalidade actual (código) | Onde vive na v7 | ✓ |
|---|---|---|---|
| 1 | Leaflet 1.9 + markercluster (`useMapCore`, `useMapMarkers`) | O mesmo. Só mudam CSS, divIcons e o filtro da base | ✓ |
| 2 | 8 modalidades + «Todos» (`HUD_SPORTS`) | Explorar → «Modalidade», grelha de 9 pílulas | ✓ |
| 3 | 140 spots de surf / 185 no total, contagem «N spots nesta vista» | Cabeçalho do Explorar + «Nesta vista 83/85» | ✓ |
| 4 | Clusters com nota + «+N» | Círculo na banda da melhor nota + «+N» espuma | ✓ |
| 5 | «Agrupar spots» | Interruptor no Explorar; botão «Agrupar» na folha 390 | ✓ |
| 6 | «Só a bombar» (nota ≥ 7) | Interruptor no Explorar; botão na folha 390 | ✓ |
| 7 | Região (+ «Continente») | Selector «Região» | ✓ |
| 8 | Filtro de nível | Selector «Nível» | ✓ |
| 9 | Chips de filtro activo com «×» e «Limpar filtros» | Chip «Kitesurf ×» (amarelo translúcido) | ✓ |
| 10 | Saltos de área Continente / Açores / Madeira | Pílulas em «Nesta vista» | ✓ |
| 11 | Lista sincronizada com o mapa (`listFollowsPan`) | Lista do Explorar, ordenada pela nota, com nome, região, nível, Hs, período, vento e offshore/onshore/cross; «a lista segue o mapa» | ✓ |
| 12 | Recolher painel (`collapseHud`) | Botão «‹» no Explorar | ✓ |
| 13 | Selector «Vento \| Ondulação \| Nenhum» | Mesmo sítio (topo), segmentado v6 | ✓ |
| 14 | Traços de vento coloridos por nós | `vento.js` v6, gelo → espuma + comprimento e brilho pela força | ✓ |
| 15 | Camada Ondulação (Hs, isolinhas, cristas) | Mesmo selector; a camada não muda nesta fase (só a legenda fica em tokens v6) | ✓ |
| 16 | Arcos de vento nos pins + «Como ler o vento no mapa» | Arcos v6 (gelo/coral/névoa) + ligação na legenda | ✓ |
| 17 | Timeline 48 h (passos de 3 h, melhor nota na vista, play, repor) | Régua de 48 h v6 (play, «Agora», hora seleccionada) | ✓ |
| 18 | Pill «Agora» / hora | Pill «Hoje 14h ▴» ao lado do selector | ✓ |
| 19 | Chip de maré, chip de brisa térmica | Na cabeça da régua (desktop) e no painel do spot | ✓ |
| 20 | Camadas: Base Mapa / Satélite | Menu Camadas → «Base» (2 cartões rádio) | ✓ |
| 21 | Tempo: Próximas 48 h, Radar IPMA (play, frames, reset), Satélite IR 10 min | Menu → «Tempo» (com mini-régua e ↺ quando ligado) | ✓ |
| 22 | Mar: SST, Correntes (Hs no mar → Ondulação) | Menu → «Mar» | ✓ |
| 23 | Navegação: Boias, Carta náutica, Avisos à navegação e orcas | Menu → «Navegação» | ✓ |
| 24 | Tempestades tropicais, Áreas de aviso IPMA (sem grupo) | Menu → secção final sem cabeçalho, como hoje | ✓ |
| 25 | Limite de 2 raster pesadas (toast) | Inalterado (lógica); toast em tokens v6 | ✓ |
| 26 | Legendas das camadas (radar, SST, correntes, batimetria, avisos) | Inalteradas na lógica; cartões em tokens v6 | ✓ |
| 27 | Zoom +/− (só pointer:fine) | Pilha, grupo superior (oculto no telemóvel, como hoje) | ✓ |
| 28 | Perto de mim (locate) | Pilha | ✓ |
| 29 | Botão Vento (arcos nos pins) | Pilha (premido = espuma) | ✓ |
| 30 | Legenda (toggle) | Pilha + cartão «Nota 0–10 / Vento · nós» | ✓ |
| 31 | Partilhar (URL com camadas, câmara, hora) | Pilha | ✓ |
| 32 | Sair do ecrã inteiro | Folha 390 (ícone), como hoje | ✓ |
| 33 | Pré-visualização do spot (desktop) | Cartão v6: nota /10, frase v6, Onda/Período/Vento, 48 h com linha 7 (Bom), maré, nível, offshore, «Ver spot», «Direcções», fechar | ✓ |
| 34 | Sheet do spot (mobile) + «Voltar à lista» | Folha v6 com o mesmo conteúdo | ✓ |
| 35 | «Melhor agora» na folha mobile + «Filtros (N)» | «Melhor na vista · hoje 14h» + «Filtros 1» | ✓ |
| 36 | Deep links (`?sport ?wind ?t ?lat/lon/z ?spot ?radar ?basemap ?nauticalChart ?goesIr …`) | Todos mantidos. Acresce `?dia=` (proposta) | ✓ |
| 37 | Atribuição dos mosaicos e dados | Linha de crédito por cima da régua/folha | ✓ |
| 38 | Cabeçalho compacto do /mapa (48 px: logótipo + «Mapa», pesquisa, tema, menu) | Igual em estrutura: VENTU + «MAPA DA COSTA», tema, lupa, ☰ | ✓ |
| 39 | Pesquisa (SearchPalette, ⌘K) | Lupa no cabeçalho (home e /mapa) | ✓ |
| 40 | Idioma | Desktop home: «PT – Português»; gaveta (390 e /mapa): «Idioma» | ✓ |
| 41 | Login / conta | Desktop home: «Entrar ▾»; gaveta: «Conta → Entrar» | ✓ |
| 42 | Rodapé do site (escondido no /mapa por scroll lock) | Inalterado; na home o bloco «Mais na costa» perde só o link duplicado | ✓ |

**Elementos reais que mudam ou ficam escondidos** (regra do Pedro):
- Cabeçalho: ganha «Mapa da costa» no 1.º nível (desktop) e o ícone (390). «Condições → Mapa» passa a «Mapa da costa». O resto da navegação fica.
- Pesquisa, idioma, login e tema: ficam onde estão (tabela acima).
- Rodapé: só sai o link «Mapa da costa» do bloco «Mais na costa» da home. O rodapé global do site não muda (não tinha /mapa).
- Home: sai o botão e o diálogo «Abrir mapa». O poster vazio passa a imagem. O chip do vento muda de sítio.
- Cabeçalho próprio do /mapa: o mesmo, em tokens v6.
- Menu Camadas: os mesmos 12 itens e a mesma ordem, em tokens v6.
- Lista: a mesma, com uma linha a mais (região + nível) para não cortar nomes compridos.

## Riscos
- **Lighthouse, home:** só entram HTML/CSS e uma imagem WebP de 31 KB (390: 20 KB) com `fetchpriority=low`. O LCP continua a ser a foto do hero, desde que a imagem do mapa não seja candidata. É preciso medir no LH local, porque no desktop o cartão é maior do que o hero e o Chrome pode escolhê-lo como LCP. Mitigação: o hero com `fetchpriority=high` (já tem) e a imagem com `loading=lazy` + `decoding=async`. O prefetch do /mapa só se faz por intenção (hover / touchstart), nunca no load.
- **Lighthouse, /mapa (82, TBT 245 ms):** o filtro SVG nos mosaicos corre na GPU, mas em SwiftShader (CI) pode custar paint. Alternativa sem custo: servir um estilo de mosaico já recolorido (CARTO custom ou pré-processado). O vento v6 é mais leve do que o actual (até 420 partículas desktop / 170 mobile, um só caminho por traço). É preciso medir o TBT com o vento ligado em mobile, que hoje começa desligado.
- **Só restyle, sem mudar o motor:** as notas do /mapa continuam a vir do `sportScore` até à #218. Na maquete a home e o /mapa dizem o mesmo número porque partilham dados. **Em produção podem divergir** até haver motor único. A pele v6 com números diferentes da home é o risco maior de confusão.
- **Transição:** a View Transition entre documentos funciona em Chrome/Edge e Safari 18.2+. A passagem do 3D oblíquo para o 2D com o norte para cima é uma fusão, não um movimento de câmara verdadeiro (isso é a fase 2, «um só mapa»).
- **Base nesta maquete:** usa Esri Dark Gray (o CARTO recusa pedidos de `file://`). A técnica é a mesma para o CARTO dark. A atribuição tem de acompanhar o mosaico que for usado.

## Decisões em aberto (Pedro)
1. **Toque num rótulo de spot no cartão da home:** abre o spot (como hoje) ou o /mapa com esse spot aberto (`?spot=guincho`)? Recomendo o /mapa com o painel aberto («uma só porta»; o spot fica a um toque, em «Ver spot»).
2. **`?dia=1` no /mapa:** o `?t=` só aceita a hora de hoje (0–23). Para «amanhã de manhã» é preciso um parâmetro novo (`dia`) ou passar `t` para ISO. Recomendo `dia`, que é retrocompatível.
3. **Vento ligado no /mapa mobile quando se chega da home:** aceita medir a performance?
4. **«Mapa da costa» também no rodapé desktop?** Nesta maquete saiu nas duas larguras, por coerência.

## Reconstruir
```
cd _build
node gen_dados.js            # dados.json
python3 assemble_home.py     # ../home.html (a partir do modelo da v6)
python3 assemble_mapa.py     # ../mapa.html
source env.sh; node poster.js 1440 900 ../img/poster-1440.png   # imagem do mapa (a partir da v6, MapLibre ao vivo)
./um.sh mapa.html ../capturas/mapa-1440.png 1440 900 "sport=kitesurf&wind=1&t=14&lat=39.35&lon=-8.95&z=7"   # uma de cada vez
python3 compor.py            # fotogramas + lado a lado (precisa de pip brotli para as fontes)
```
