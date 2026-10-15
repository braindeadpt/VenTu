# #183 — cabeçalho do site + hero v6 na home

Decisão do Pedro (15/10, 15h42): **a home mantém o cabeçalho do site**. A barra de topo
da maquete (`HomeTopBar`: logótipo + Kite · Surf) não pode duplicar o logótipo nem a
navegação. Este documento é o estudo feito **antes** de mexer no código.

## 1. Inventário do cabeçalho actual em `/pt/` (`src/components/layout/Header.tsx`)

| | 390 × 844 (< lg) | 1440 × 900 (≥ lg) |
|---|---|---|
| Posição | `fixed` no topo, `z-[1300]`; o `<main>` compensa com `pt-16` (não é `sticky`, mas fica sempre visível) | igual |
| Altura | 64 px (`h-16`) + 1 px de linha | 64 px + 1 px |
| Fundo | `bg-base/95` + `backdrop-blur-md`, linha `border-divider` (tokens do tema: slate/cyan; muda com tema claro e com `data-daypart=sunset`) | igual |
| Logótipo | ícone `Wind` (cyan) + «Ven**Tu»** 18 px bold, liga a `/pt/` | 20 px, ícone 32 px |
| Navegação | hamburger 44 × 44 → gaveta `#mobile-nav` (Condições + modalidades, Planear, Diretório, Notícias, Conta) | `nav` inline: Condições (mega), Planear (mega), Diretório, Notícias |
| Pesquisa | botão 44 × 44 (lupa) → `SearchPalette`; atalho ⌘K / `/` | botão 36 px + «⌘K/Ctrl+K» (≥ 2xl) |
| Idioma | `select` dentro da gaveta (linha de 44 px) | `select` com globo (44 px de altura) |
| Tema | `ThemeToggle` dentro da gaveta | `ThemeToggle` inline |
| Login / conta | «Entrar» + favoritos/passaporte na secção «Conta» da gaveta (44 px) | `AccountMenu` (botão «Entrar» / e-mail) |

## 2. Cabeçalho × `HomeTopBar` da maquete

| Função | Cabeçalho do site | HomeTopBar (maquete) | Resultado |
|---|---|---|---|
| Logótipo → `/pt/` | sim | sim (ondas + VENTU itálico) | **duplicado** → sai da HomeTopBar |
| Selector Kite · Surf (`?d=`, partilhado com o spot) | não | sim | **falta no cabeçalho** → é a única coisa da HomeTopBar que fica |
| Navegação, pesquisa, idioma, tema, conta | sim | não | a maquete não os tinha; ficam no cabeçalho |
| Linguagem visual v6 (abismo, Barlow, linha `#1E4361`) | não (slate/cyan) | sim | **falta no cabeçalho** → tokens v6 na home |
| Altura | 64 px | 76 px (1440), ~64 px (390, sobre a foto) | o cabeçalho é 12 px mais baixo: o 1.º ecrã a 1440 cabe com folga |

## 3. Integração escolhida (uma só)

1. **O cabeçalho do site fica, igual em estrutura e comportamento** (mesmos botões, mesma
   gaveta, mesmos specs em `/pt/`). Na home recebe `data-v6="home"` e só os **tokens** mudam
   (CSS em `v6-home.css`): fundo abismo `rgba(3,14,24,.92)` com blur, linha `#1E4361`,
   texto espuma/névoa, acento gelo/sol, logótipo e navegação em Barlow (logótipo em Barlow
   Condensed 900 itálico, «TU» a sol, ícone a gelo). Sempre escuro na home (a home v6 é
   `color-scheme: dark`), sem a tinta `sunset`. Um só logótipo: o do cabeçalho.
2. **`HomeTopBar` desaparece.** O selector **Kite · Surf vai para o hero**, no canto superior
   direito da foto do nº 1, com o crédito da foto logo abaixo.
   *Porquê no hero e não no cabeçalho:* (a) a 390 o cabeçalho já está cheio (logótipo +
   pesquisa 44 + menu 44); o selector (2 × 76 px) obrigaria a encolher alvos abaixo de 44 px
   ou a esconder a pesquisa; (b) o cabeçalho continua genérico e igual em todas as rotas, sem
   uma «ranhura» só da home; (c) o selector governa o que está à volta dele (palavra, frase,
   top 3, mapa e régua) e a 390 fica exactamente onde a maquete o tem (canto superior direito
   sobre a foto), só sem o logótipo à esquerda.
3. **1.º ecrã a 1440 × 900:** cabeçalho 64 px + hero/mapa logo abaixo (16 px), o «VAI.» e o
   mapa inteiros acima da dobra (a régua também, como na maquete).
4. **390:** cabeçalho compacto de 64 px; pesquisa (44 × 44) e menu (44 × 44) visíveis;
   idioma, tema e «Entrar» na gaveta, todos com 44 px; selector 44 px de altura.
5. Specs do cabeçalho (`critical-routes`: banner com «Ven», paleta de pesquisa, idioma, nav,
   login) ficam em `/pt/` como estavam; o spec do filtro de modalidade passa a procurar o
   grupo «Modalidade» no hero.

## 4. Capturas (opção escolhida × maquete)

Ver secção «Capturas» abaixo (preenchida depois da implementação).

## 5. Recomendação para o spot v6 (não muda neste PR)

Recomendo **dar ao spot v6 o mesmo cabeçalho do site com os tokens v6** (`data-v6`), em vez
de o esconder: pesquisa, idioma e conta ficam a um toque em todas as páginas, a home e o spot
passam a ter o mesmo topo, e o «‹ Costa» + Kite · Surf do spot desce para o hero do spot
(como fizemos aqui). Fica para uma issue própria, com os specs e baselines do spot.
