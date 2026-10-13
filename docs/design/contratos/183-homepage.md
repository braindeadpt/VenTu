# Contrato visual — #183 Homepage personalizada (spots + heatmap)

Referências: `183-home-spots-390.png`, `183-home-spots-1440.png`, `183-home-heatmap-390.png`, `183-home-heatmap-1440.png` (+ `-rm`).

## Layout
- Secções: «Os teus spots», «Perto de ti (cidade estimada)», «Quando ir esta semana», Dawn Patrol.
- 390: filas de cartões com scroll horizontal e snap; o cartão seguinte espreita 15–30 px (affordance). Cartão 160 × ≥112 px.
- 1440: duas colunas (Os teus spots | Perto de ti), cartões em grelha 2×N; heatmap a toda a largura do contentor (1152 px).

## Cartão de spot
- Linha topo: desporto (ícone + nome) e contexto (Hoje / N km); nome (1 linha, reticências); score grande na cor do tier + label (Épico/Bom/Razoável/Fraco/Fechado); meta «melhor HHh · 1,6 m · 11 s» ou «· 9 kn» para kite.
- O cartão inteiro é um botão (≥ 44 px), abre o spot.

## Heatmap
- Linhas = spots, colunas = 7 dias (Hoje destacado com contorno). Célula: score do melhor momento do dia + hora; cor do tier; ponto = confiança baixa; ★ = melhor dia do spot.
- Filtros Todos/Surf/Kite e ordenação Hoje/Semana/Distância, segmentados.
- 390: coluna dos nomes fixa (sticky) e scroll horizontal dos dias; células ≥ 44 × 44.
- Legenda dos tiers por baixo.

## Estados extra
- Sem favoritos: «Os teus spots» mostra 1 cartão-convite «Marca um spot com ☆ para o veres aqui», sem fila vazia.
- Sem localização: «Perto de ti» usa Lisboa e diz «(estimado)»; nunca pede permissão sem acção do utilizador.
