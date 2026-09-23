# Mapa — spec v3 («o mapa primeiro»)

Direcção: Atlantic Editorial Ops, carta náutica. O mapa é o ex-líbris: os spots vêm primeiro e as ferramentas aparecem quando se pedem.
Esta spec só é implementada DEPOIS de a maquete interactiva ser aprovada pelo dono do produto. Os números aqui são o ponto de partida da maquete.

## 0. Princípios
1. **Spots visíveis no primeiro frame.** No arranque vê-se pelo menos 1 spot individual por região costeira no desktop, e os melhores no mobile.
2. **Um sítio para cada coisa.** Filtros no painel/sheet. Camadas no menu Camadas. Acções de vista (localizar, partilhar, zoom, vento, legenda) numa só pilha de controlos. Tempo num só scrubber.
3. **Estados, não acções, nos toggles.** Um toggle mostra o estado com aria-pressed e o aspecto ligado/desligado, e o rótulo é o nome da coisa («Vento»), nunca «Ocultar vento».
4. **Uma iconografia.** Marcadores, clusters e controlos partilham forma (círculo), espessura de traço e tipografia (Geist Mono nos números).
5. **Cor = score.** As cores dos escalões ficam só para scores. Os estados activos de UI usam neutro/accent-primary.

## 1. Cromo da rota /mapa
- O cabeçalho global compacta para 48 px em /mapa (variante «compact» activada pela rota: logo, «Mapa», pesquisa, menu). As outras páginas não mudam.
- O mapa ocupa o resto do ecrã (100dvh − 48 px).
- A atribuição aparece UMA vez: no desktop, controlo Leaflet no canto inferior esquerdo, à direita do painel (offset = largura do painel); no mobile, dentro do sheet (como hoje). Nunca sobreposta.

## 2. Pilha de controlos (direita, vertical, 44 px por botão, gap 8, raio 12)
Por ordem: [+][−] (só com pointer:fine) · Localizar · Camadas · Vento (toggle) · Legenda (toggle) · Partilhar.
- Fica fixa ao topo direito, com offset do cromo.
- A barra de ferramentas do topo actual desaparece:
  - «Mostrar todos» passa a switch «Agrupar spots» no painel;
  - «Ocultar vento» passa ao toggle Vento;
  - o «?» passa ao toggle Legenda;
  - «Radar IPMA» passa para o menu Camadas.
- Tooltip no hover (desktop) com o nome.

## 3. Tempo
- No topo ao centro fica um pill «Agora · 16:00 ▾». Clicar abre um scrubber de 48 h ancorado em baixo ao centro (desktop 560 px; mobile a toda a largura, logo acima do peek).
- O scrubber usa a mesma linguagem visual da régua da página de spot: barras do melhor score na vista por hora, noite sombreada, play/pause, setas do teclado. Reutiliza useMapTimeTrack.
- Enquanto a hora escolhida não for «agora», o pill mostra «qui 16:00» em --verdict e os marcadores mostram os scores dessa hora.

## 4. Legenda (toggle)
- Cartão compacto no canto inferior direito: 5 amostras DISCRETAS com os rótulos canónicos (getScoreTierLabel) e intervalos: ÉPICO 80–100 · BOM 60–79 · FUN 40–59 · FLAT 20–39 · FECHADO 0–19.
- Com o vento ligado, junta a legenda de vento com amostras de traço reais (a mesma cor e espessura das partículas) para 5 / 15 / 25+ kt.
- Com camadas de mar ligadas (Hs, SST, correntes), cada uma junta a sua mini-escala.
- Por defeito aberta no desktop e fechada no mobile. Lembrada em localStorage (try/catch).

## 5. Painel Explorar (desktop 360 px) / Sheet (mobile)
Cabeçalho: «Explorar» + «114 spots nesta vista» + botão recolher (recolhido = rail de 56 px com a contagem vertical).
Filtros, por esta ordem, todos com rótulo visível:
- **Modalidade:** segmented de ícones com rótulo, que quebra de linha e nunca corta (Todas · Surf · Bodyboard · Kite · Windsurf · Foil · SUP).
- **Região** e **Nível:** dois selects lado a lado («Região: Todas ▾», «Nível: Todos ▾»), menus acessíveis.
- **Só a bombar** (switch) · **Agrupar spots** (switch).
- Filtros activos como chips removíveis por baixo, e «Limpar» se houver algum.
- Estado das boias: uma LINHA de texto neutra com ícone âmbar («2 boias sem dados há 5 h · Dispensar»). Nunca botão vermelho.
- Mapa/Satélite: fica no menu Camadas (secção «Base»), não no painel.
Lista «Nesta vista» (ordenada por score, com a ordenação num select):
- Linha de 64 px: mosaico do score (44×44, cor do escalão) · nome (até 2 linhas, sem reticências) · região · métricas em fg-muted com ícones Lucide («1,2 m · 11 s · ↘ 4 kt cross-off»). Sem três cores.
- Hover na linha realça o marcador (anel), e hover no marcador realça a linha. Clique: flyTo (600 ms, easeOutCubic) e abre a pré-visualização.
- Ilhas: chips «Continente · Açores · Madeira» no cabeçalho da lista para saltar de região.
Sheet mobile (3 estados, snap):
- **Peek, 136 px:**
  - linha 1: cartão «Melhor agora» (mosaico, nome, região, porquê em 1 linha);
  - linha 2: [Filtros (2)] · switch «Só a bombar» · «114 spots».
  - Nada de linhas só com ícones.
- **Meio:** os filtros como no painel.
- **Aberto:** a lista.
- Gestos (skill apple-design):
  - arrasto 1:1 no grabber e no cabeçalho, com rubber-band nos limites;
  - projecção de momentum para escolher o estado;
  - snap com cubic-bezier(.32,.72,0,1) em 320 ms;
  - com prefers-reduced-motion, cross-fade de 150 ms.

## 6. Marcadores e clusters
- **Marcador:** círculo de 34 px, preenchido com a cor do escalão, score em Geist Mono 13 px branco/escuro com contraste ≥4,5:1, anel de 2 px bg-base. A seta de vento fica como tique de 10 px no anel (só com o vento ligado).
- **Hover** (desktop): scale 1.08 + tooltip com o nome, em 120 ms.
- **Seleccionado:** scale 1.15 + anel exterior de 3 px accent + z-index no topo.
- **Cluster:** círculo com a mesma linguagem: anel de 3 px na cor do escalão do MELHOR filho, interior neutro, melhor score ao centro, contagem num badge de 18 px. Diâmetro 38 / 44 / 50 conforme a contagem (<10 / <50 / ≥50). Igual no mobile e no desktop.
- **Clustering:** desktop maxClusterRadius 40, disableClusteringAtZoom 9; mobile 52 / 9. Aceitação: no arranque, desktop 1440×900 com «Todas», ≥ 40 % dos spots visíveis individualmente; mobile 390×844, ≥ 1 marcador individual por região (Norte, Centro, Lisboa, Alentejo, Algarve).
- Clique num cluster: zoomToBounds animado (Leaflet animate true, 400 ms); spiderfy no zoom máximo.
- Entrada de marcadores ao mudar filtros/hora: opacity 0→1 em 150 ms, sem mexer na posição.

## 7. Pré-visualização de spot
- **Desktop:** cartão de 320 px ancorado ao marcador (não o popup Leaflet default):
  - nome (display 20 px) · região;
  - score grande + banda;
  - porquê (getSpotScoreFactors);
  - 3 métricas;
  - sparkline de 12 h do score;
  - [Ver spot →] (primário) + [Como chegar].
  - Entra com scale .96→1 + opacity em 180 ms e fecha com Esc ou clique fora.
- **Mobile:** o sheet passa a mostrar o spot (peek com o cartão, «←» para voltar à lista), com o mesmo conteúdo.
- Deep link ?spot= abre esta pré-visualização.

## 8. Menu Camadas (popover no desktop / secção do sheet no mobile)
Grupos com cabeçalho:
- **Base:** Mapa · Satélite (radio).
- **Tempo:** Radar IPMA · Próximas 48 h.
- **Mar:** Hs · Temperatura da água (SST) · Correntes · Isóbatas · Batimetria.
- **Navegação:** Boias · Sinalização náutica · Avisos à navegação (IH).
Cada linha: ícone · nome · 1 linha de descrição em fg-muted · switch à direita (estado visível). Com a camada ligada, mostra uma mini-legenda inline. Máximo de 2 camadas raster pesadas ao mesmo tempo (a 3.ª desliga a mais antiga, com um toast «Radar desligado para manter o mapa fluido»). Teclado conforme já existe (menu-button ARIA).

## 9. Vento
- As partículas usam o token de vento (data wind #8B5CF6) a 45 % de opacidade, com a densidade a subir com o zoom. Ficam em fade-out durante pan/zoom e voltam 300 ms depois de settled.
- Por defeito: ligado no desktop, desligado no mobile (bateria). O toggle mostra o estado.

## 10. Enquadramento inicial
Enquadra o continente português (bounds da costa continental) com padding para o painel (esquerda, 360 + 24 px) ou para o peek (fundo). Açores e Madeira ficam acessíveis pelos chips de ilha. Nenhum marcador nasce debaixo do cromo (o teste existente mantém-se).

## 11. Movimento (tabela única do mapa)
| Elemento | Propriedades | Duração | Curva |
|---|---|---|---|
| Sheet snap | transform | 320 ms | cubic-bezier(.32,.72,0,1) |
| Painel recolher/abrir | transform (translateX) | 240 ms | cubic-bezier(.16,1,.3,1) |
| Popover Camadas / Legenda / pré-visualização | opacity + scale .96→1 | 180 ms | out-expo |
| Hover no marcador | transform scale | 120 ms | ease-out |
| Selecção de marcador | transform scale + anel | 160 ms | ease-out |
| flyTo a partir da lista | Leaflet flyTo | 600 ms | easeOutCubic |
| Entrada de marcadores | opacity | 150 ms | ease-out |
| Partículas de vento em pan/zoom | opacity | 200 ms fade out / 300 ms fade in | linear |
prefers-reduced-motion: sem flyTo (setView), sem stagger, o sheet faz cross-fade e as partículas ficam desligadas.

## 12. Critérios de aceitação
- 0 erros na consola. Pan e zoom a 60 fps num Moto G (throttle 4× CPU no Chrome): trace sem long tasks > 50 ms durante o pan.
- Nenhum texto cortado nos nomes de spots (lista, peek, pré-visualização). Nenhuma sobreposição de cromo a 390, 768 e 1440 (teste de colisão por bounding boxes).
- Todos os toggles com aria-pressed; todos os controlos com nome acessível; alvos ≥ 44 px.
- A atribuição aparece uma vez e visível (a licença obriga).
- Legenda com os rótulos canónicos (teste).
