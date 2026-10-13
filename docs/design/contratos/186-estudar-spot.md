# Contrato visual — #186 Estudar o spot

Referências: `186-estudar-sessao-390.png`, `186-estudar-sessao-1440.png`, `186-estudar-chegar-*.png`, `186-estudar-estadia-*.png` (+ `-rm`).

## Layout
- Ecrã inteiro (overlay), botão ✕ e breadcrumbs no topo; título «Estudar o spot», subtítulo «Spot · arrasta e aproxima».
- Modos segmentados Sessão | Chegar | Estadia e família (390: por baixo do título; 1440: topo direito). Nada ligado por defeito além de Sessão.
- 390: cartão de condições (Vento, Ondulação, Maré, Score) por cima da régua; 1440: painel à direita com condições + cartão do modo.
- Controlos N / + / − à direita, 44 px; escala e © OpenStreetMap em baixo à esquerda, legíveis.

## Mapa
- Leque de direcção do vento centrado na zona de surf (cor do tipo: side-on amarelo, offshore verde, onshore vermelho), rótulo da direcção, selo «ZONA DE SURF · Tier · score».
- Ondulação: linhas de crista paralelas, só no mar, a mover-se na direcção do swell.
- Vento: partículas com trilho e fade, só no mar, curl suave, sem aspecto de chuva.
- POIs por modo (Chegar: P, acessos; Estadia: alojamento, escolas, restauração), agrupados quando a < 36 px; toque abre popover.

## Critérios específicos
- Abrir a partir do mini-mapa ou do botão «Estudar o spot» em ≤ 600 ms (lazy load), histórico do browser: ✕ e «voltar» fecham o overlay.
- Pinch/scroll zoom e arrasto sem perder 60 fps em desktop; textos do mapa sem sobreposição.
- Cartão Chegar com tempo de carro real ou escondido (nunca placeholder).
- Régua: rótulos dos dias não cortados à direita em 1440 (último dia visível ou com fade).
