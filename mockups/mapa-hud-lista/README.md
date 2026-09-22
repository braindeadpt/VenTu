# Mockups — HUD mobile e lista sincronizada do mapa (prompt 9)

**Só mockup.** Nada disto tocou em `src/` nem `tests/`. Os shots foram gerados
a injetar DOM/CSS por cima de `/pt/mapa/` do `build:e2e` (mapa, marcadores e
copy reais), servido em `127.0.0.1:4189`. Todo o CSS usa tokens do design
system (`rgb(var(--token))`), por isso os dois temas saem de graça.

Regerar:

```bash
npm run build:e2e          # se out/ não existir
npx serve out -l 4189      # terminal à parte
node mockups/mapa-hud-lista/inject-mockup.mjs
```

## Problemas auditados → decisões

| # | Problema (iPhone 13, 390×844) | Decisão no mockup |
|---|---|---|
| 1 | HUD ocupa ~⅓ do ecrã; faixa vazia só para a seta | Sheet real com grabber (40×4) que também abre/fecha — a «faixa morta» passa a ser a própria alça |
| 2 | 7 botões só com ícone, ilegíveis | Estado «meio» tem todas as camadas e extras com **rótulo** + checkbox visual (grid 2 col, alvos ≥44 px) |
| 3 | Aviso de boias = triângulo sem texto | Linha de aviso com texto completo («2 boias sem dados há 5 h») + «Dispensar» no topo do sheet/painel |
| 4 | Legenda «SCORE NÁUTICO» tapa marcadores | Sai do mapa: vive na secção «Ver também → Legenda do score» (mobile) e no rodapé do painel (desktop) |
| 5 | Não há lista; 185 marcadores ilegíveis para teclado/leitor | Lista sincronizada «Nesta vista»: ordenada por score, segue pan/zoom, cada linha é `<button>` (roving tabindex: ↑↓ navegam, Enter abre) |

## Estados do sheet mobile (390×844)

- **Peek** (~140 px): grabber + «Melhor agora» (score com cor do tier, nome,
  região, 2 fatores) + uma linha de filtros essenciais (Desporto, Região,
  «⚡ A bombar»). Custo: ~2 cm de mapa — em troca responde a «onde está bom?»
  sem abrir nada.
- **Meio** (~56 % altura, scroll interno): aviso de boias + Modalidade + Nível
  + Região + Camadas com rótulos + «Ver também» (agrupar, vento, 48 h,
  satélite, legenda, sair). Tudo na zona do polegar.
- **Aberto** (~78 %): a lista «Nesta vista». Custo: o mapa fica quase todo
  tapado — é o estado de consulta, fecha-se no grabber ou a tocar num spot.

### Variante do peek (escolha real — decidir)

- **A** (`m-peek-a-*`): «Melhor agora» visível. Resposta instantânea à pergunta
  principal; custa ~48 px extra no peek.
- **B** (`m-peek-b-dark`): só contagem + filtros numa linha. Mais mapa à vista,
  mas «onde está bom?» exige abrir a lista.

## Painel desktop (1440×900)

- **Aberto** (`d-panel-*`): doca à esquerda (348 px, não colide com a coluna de
  controlos à direita): título + contagem + ordenação, filtros ativos, aviso
  de boias, lista e mini-legenda no rodapé.
- **Recolhido** (`d-rail-dark`): rail de 48 px com contagem vertical — um
  clique reabre. Mantém o mapa todo livre.

## Acessibilidade assumida no desenho

- Todos os alvos ≥ 44 px (grabber, pills, linhas, camadas).
- Sheet `role="region"` com `aria-label` por estado; lista `role="listbox"`
  com linhas `<button>` (navegáveis por teclado e nomeadas para leitores).
- `aria-pressed` em todos os toggles; estados ligados também por cor de tier.
- Sem conteúdo só-ícone em lado nenhum.

## O que NÃO está no mockup (decisões adiadas)

- Gestos de arrasto do sheet (a implementação segue as regras apple-design:
  1:1 tracking, projeção de momentum, `prefers-reduced-motion` = cross-fade).
- Deep-link `?spot=` — deve abrir diretamente a linha do spot na lista.
- Virtualização da lista (185 linhas — provavelmente desnecessária, medir).
