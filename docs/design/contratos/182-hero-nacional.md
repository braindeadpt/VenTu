# Contrato visual — #182 Hero nacional ao vivo + zoom

Referências: `182-hero-vento-390.png`, `182-hero-vento-1440.png`, `182-hero-ondulacao-390.png`, `182-hero-ondulacao-1440.png`, `182-hero-vento-*-rm.png`.

## Layout
- 1440: título e controlos à esquerda (máx. 600 px de largura); continente ocupa o terço direito, centrado verticalmente; costa inteira de Cabedelo a Arrifana visível sem corte. Insets Açores e Madeira em baixo à esquerda, lado a lado, 140×85 px aprox., com rótulo.
- 390: título no topo (máx. 3 linhas), slider de hora logo abaixo, continente a ocupar a largura útil; insets empilhados em baixo à esquerda sem tapar marcadores; legenda kn e selector Vento|Ondulação em baixo à direita, sem se sobreporem.
- Altura do hero: 1440 → 630 px ± 20; 390 → até 720 px (o explainer 1-2-3 fica visível sem scroll ou a ≤ 40 px).

## Conteúdo
- Título: «Hoje a bombar: A, B e C.» com nomes como links; scores numa linha separada «Score A 7,6 · B 7,4 · C 7,3 (0–10)».
- Linha kite com a hora de pico real e a categoria derivada desse valor.
- «Previsão de hoje · atualizado HH:MM» (hora de Lisboa).

## Mapa
- Terra sem contorno (sem costura), cor --land, sem arestas rectangulares em nenhum zoom.
- Vento: partículas com trilho e fade, cor por kn; nunca sobre terra; densidade sem efeito «chuva» (trilhos ≥ 12 px, não tracinhos uniformes).
- Ondulação: cristas perpendiculares à direcção, espaçamento em pixels de ecrã, só no mar.
- Marcadores: tier por cor; os 3 top têm rótulo e ficam por cima (z-index); rótulos não se sobrepõem entre si a 390 (colisão → esconder o rótulo do marcador de menor score).
- Toque/clique num marcador → zoom animado (≤ 900 ms, ≤ 150 ms com reduced-motion) até ao spot e abre a página rápida (#184); breadcrumbs «Portugal › Região › Spot».

## Critérios específicos
- Clique no marcador Ribeira d'Ilhas a 390 e 1440 abre o spot em ≤ 1,2 s, sem erros.
- Slider de hora em passos de 6 h, rótulo «Seg 12 · 16h» actualiza o campo e os marcadores.
- Hero a 60 fps em desktop médio; em mobile, o canvas a ≤ 2× DPR e pausa fora do viewport.
