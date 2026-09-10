# Audit Visual do Mapa — 2026-09-09

Auditor: Freebuff (Codebuff) | Âmbito: mapa interactivo (`/pt/mapa/`, embeds do grid de spots e hero da homepage) | Desktop + Tablet + Mobile

---

## Resumo executivo

Auditoria visual completa ao mapa e a todas as suas funções, em 4 viewports
(desktop 1440×900, laptop 1024×768, tablet 768×1024 touch, mobile 390×844 touch)
e em 4 superfícies (fullscreen `/mapa`, grid de spots, hero da homepage, embed
de spot). Foram medidos geometria dos overlays (controlos, legenda, HUD, zoom,
atribuição), alvos de toque (WCAG 2.5.8, piso 44×44 CSS px), estados
interativos (legenda expandida/colapsada, HUD expandido, sheet do spot, popup)
e o alinhamento dinâmico legenda-vs-HUD.

**Resultado pós-fix: 0 alvos <44px em todas as superfícies touch (mobile +
tablet).** No desktop (rato) mantêm-se duas densidades intencionais e
documentadas: cabeçalho da legenda compacto e pills de filtro a 36px.

---

## Método

1. Leitura completa do código dos overlays (`SpotMapInteractive`, `MapLegend`,
   `MapExploreHud`, `MapLayerToggle`, `MapControls`, `BuoyLayerNotice`,
   `FilterPill`, `SpotPopupContent`, `MapTimeTrack`, CSS global do mapa).
2. Auditoria ao vivo com sondas Playwright read-only
   (`scripts/audit/audit-map-visual.mjs` — 4 viewports; `scripts/audit/audit-map-embeds.mjs` —
   4 superfícies): `getBoundingClientRect` + `elementFromPoint` (hit-testing de
   sobreposições) + medição de alvos de toque em todos os botões dos overlays.
3. Verificação pós-fix das mesmas sondas (tabela "Evidência" abaixo).
4. Spec e2e nova (`tests/e2e/map-touch-targets.spec.ts`) para impedir
   regressões; suites existentes re-corridas na via CI (static export).

---

## Defeitos encontrados e corrigidos

| # | Superfície | Antes | Depois | Fix |
|---|-----------|-------|--------|-----|
| 1 | Legenda (mobile) | toggle **105×17px** — único controlo para abrir a legenda | 44px+ | `MapLegend.tsx` — `min-h-[44px]` abaixo de `lg` |
| 2 | Rádio "Satélite" do HUD (mobile) | **39px** de largura | ≥44×44 | `MapExploreHud.tsx` — `min-w-[44px]` nos rádios de camadas |
| 3 | Chips do hero (mobile, homepage) | **28–36px** altura | 44×44 | `SpotMapInteractive.tsx` — `min-h-[44px]` + `min-w-[44px]` nos botões radar/isóbatas |
| 4 | ✕ dismiss do aviso de boias (todas) | **22×22px** | 44×44 (`w-11 h-11`) | `BuoyLayerNotice.tsx` + `pr-12` no texto para não colidir |
| 5 | `MapLayerToggle` Mapa/Satélite (embeds) | **28px** altura | 44px (`min-h-[44px]`) | `MapLayerToggle.tsx` |
| 6 | Pills de filtro do HUD (mobile + tablet touch) | **36px** altura | 44px abaixo de `lg` | `FilterPill.tsx` — `min-h-[44px] lg:min-h-[36px]` |
| 7 | Legenda em tablet touch | cabeçalho 17px sem função (conteúdo sempre visível) | cabeçalho 44px **com collapse funcional** abaixo de `lg` | `MapLegend.tsx` — conteúdo `lg:block` em vez de `sm:block` |
| 8 | Botão fullscreen (grid de spots) | label hard-coded `'Explorar'` ignorava i18n | `t.hero.exploreMap` ("Explorar mapa" / "Explore map") | `MapControls.tsx` + `SpotMapInteractive.tsx` |
| 9 | Hero da homepage (mobile) | legenda `top-[6.75rem]` colidia com os chips maiores (6px de graze) | `top-[7.5rem]` — folga 6px, nunca clipa | `MapLegend.tsx` |

### Decisões de design documentadas (intencionais, não defeitos)

- **Desktop (≥`lg`, rato):** cabeçalho da legenda compacto (17px) — o conteúdo
  está **sempre visível** (`lg:block`), e pills de filtro a 36px (densidade de
  rato). WCAG 2.5.8 aplica-se a input por ponteiro; no tablet (touch, 768–1023)
  o piso de 44px aplica-se — daí o breakpoint em `lg`, não `sm`.
- **Chevron da legenda:** só visível abaixo de `lg` (onde o toggle funciona).

### Verificado como OK (sem intervenção)

- Sem colisões de overlays em nenhum viewport (controlos × zoom × legenda ×
  HUD × layerToggle); atribuição clicável e não sobreposta.
- Elevação dinâmica da legenda quando o HUD expande (folga 12px, `hudLift`).
- Sheet do spot em mobile: empilhamento correto com o HUD; botão fechar ≥44px.
- Sem scroll de fundo em página com mapa; tiras de filtros roláveis
  horizontalmente (touch-pan-x) com edge-fade; watchdog de tiles honesto.

---

## Evidência pós-fix (sondas Playwright)

### `scripts/audit/audit-map-visual.mjs` — alvos <44px por viewport

| Viewport | Antes | Depois |
|----------|-------|--------|
| desktop 1440 | 22 (pills 36px + legenda 17px — densidade intencional) | 22 (idem, inalterado) |
| laptop 1024 | 22 (idem) | 22 (idem) |
| tablet 768 (touch) | 22 | **0** |
| mobile 390 (touch) | 9 (incl. HUD expandido) | **0** |

### `scripts/audit/audit-map-embeds.mjs` — alvos <44px por superfície

| Superfície | Antes | Depois |
|------------|-------|--------|
| desktop · spots-embed | 1 (legenda 17px, intencional) | 1 (idem) |
| desktop · home-hero | 1 (idem) | 1 (idem) |
| mobile · spots-embed | 2 | **0** |
| mobile · home-hero | 4 (chips 28–36px) | **0** |

---

## Testes

- **`tests/e2e/map-touch-targets.spec.ts`** (novo, 6 testes, na via CI/static
  export): toggle da legenda ≥44px e expande ao toque; rádios Mapa/Satélite
  ≥44px; pills de modalidade ≥44px (mobile expandido + tablet); rótulo i18n do
  fullscreen PT/EN; chips do hero ≥44×44. **6/6 passam.**
- **Suites existentes na via CI** (static export, `npm run build:e2e`):
  `map-touch-targets`, `isobaths`, `map-buoys`, `mapa-route`, `home-map-first`:
  **33/33 passam**; `visual-ux-audit`: 35/37 (2 falhas de header
  tema/idioma — trabalho pré-existente de theme-cookie, não relacionado com o
  mapa; passam isoladas).
- **TypeScript:** `tsc --noEmit` limpo. **Lint:** `npm run lint` limpo.
  **Unit:** 163 ficheiros / **1468 testes** passam.

> Nota dev-server: em `next dev` com Turbopack, `localhost` é a origem de dev
> permitida — `127.0.0.1` é bloqueada pelo Next (HMR), o que impede a
> hidratação da página em testes Playwright. Usar `PLAYWRIGHT_BASE_URL=http://localhost:<porta>`
> ou a via CI (static export). Algumas falhas vistas em dev (isóbatas/boias em
> paralelo, sync de filtros após reload, "Router action dispatched before
> initialization") são artefactos do dev server — todas passam no static export.

---

## Baselines visuais (CI)

As alterações visuais (legenda mobile +27px, pills +8px abaixo de `lg`, chips
do hero 44×44, ✕ das boias 44px) alteram os goldens de `visual-regression`.
Os baselines são **bound à plataforma Linux** — um contribuidor em Windows não
os pode produzir (`tests/e2e/visual-regression.spec.ts-snapshots/*-win32.png`
está no `.gitignore`). Após merge, executar o workflow manual
**Record Visual Baselines** (`.github/workflows/record-visual-baselines.yml`,
`workflow_dispatch`) para re-gravar e o gate fica verde.

---

## Como re-correr a auditoria

```bash
npm run dev                     # servidor em http://localhost:<porta>
AUDIT_BASE=http://localhost:<porta> node scripts/audit/audit-map-visual.mjs
AUDIT_BASE=http://localhost:<porta> node scripts/audit/audit-map-embeds.mjs
AUDIT_BASE=http://localhost:<porta> node scripts/audit/audit-map-popup-sheet.mjs
PLAYWRIGHT_BASE_URL=http://localhost:<porta> npx playwright test map-touch-targets map-popup-ver-spot
```

---

# Popups de spot e bottom sheet — auditoria 2026-09-10

Auditoria detalhada ao popup de spot (desktop/tablet) e à bottom sheet
(mobile) com `scripts/audit/audit-map-popup-sheet.mjs` (geometria, tipografia,
alvos de toque, hit-testing e stacking), mais os novos testes e2e
(`map-popup-ver-spot.spec.ts`).

## Defeitos encontrados e corrigidos

| # | Superfície | Antes | Depois | Fix |
|---|-----------|-------|--------|-----|
| 1 | Popup (desktop) | CTA «Ver spot» **tapado pelo cartão do HUD** para spots no fundo do mapa (o `.spot-popup` z-1200 não escapa ao stacking do `leaflet-popup-pane` z-700 < HUD z-1100) — CTA inclicável | autoPan desloca o mapa até o popup assentar **acima do HUD** | `mapMarkers.ts` — `autoPanPaddingTopLeft: (260,64)` + `autoPanPaddingBottomRight: (24,260)` |
| 2 | Popup (tablet touch) | sobrepunha a coluna de controlos (MapControls) e CTA com **32px** de altura | popup fora da coluna (x≥260) e CTA **44px** | idem + `SpotPopupContent.tsx` — `min-h-[44px]` no `.ventu-popup-detail` |
| 3 | Popup (todas) | badge de score **por baixo do botão ✕** (44px, topo-direita) — colisão visual | badge em `right-12` (48px), livre do close | `SpotPopupContent.tsx` |

### Verificado como OK

- Popup dentro do viewport em desktop/tablet; close 44×44 clicável; nome/região
  sem truncagem; CTA hit-test limpo nos 2 viewports.
- Sheet mobile: stacking correcto (sheet 1201 > backdrop 1200 > HUD 1100),
  backdrop tapa a área do mapa, Escape fecha, acções «Ver spot»/«Como chegar»
  50px e **alcançáveis após scroll** (a dobra inicial é normal — a sheet faz
  scroll; verificado scrollando até ao fim).

## Testes

- **Unit** (`src/components/spots/__tests__/spotPopupContent.test.ts`, 4):
  CTA ≥44px + href; badge em `right-12` (nunca `right-1.5`); sem badge quando
  score=0; conteúdo nome/região/vento.
- **e2e** (`map-popup-ver-spot.spec.ts`, 3, na via CI): navegação «Ver spot»;
  CTA clicável com o pior caso (marcador mais a sul, zona do HUD) — ≥44px,
  dentro do viewport, topmost no hit-test; tablet — popup sem overlap com a
  coluna de controlos e CTA ≥44px em touch.
- **Regressões na via CI**: `mapa-route` + `mobile-playtest` 19/19;
  `visual-ux-audit` 37 pass / 0 fail; unit 1475/1475; `tsc` e lint limpos.

> Nota de flake (pré-existente, agora endurecida): o picker de marcadores da
> spec antiga escolhia o primeiro marcador in-view, mas na vista nacional
> muitos ficam **sob o cartão do HUD** — o clique real acertava no HUD
> («Element is outside of the viewport»). O novo picker exige centro
> descoberto (`elementFromPoint` = marcador) e espera o autoPan assentar.

---

# HUD «Modo explorar» — auditoria 2026-09-10

Auditoria em profundidade ao HUD (`MapExploreHud`) em 5 viewports (1440,
1024, 768 touch, 390 touch, 360 touch), com `scripts/audit/audit-map-hud.mjs`:
geometria do cartão e das linhas, overflow horizontal, alvos de toque (<lg),
tiras de scroll (alcance do último botão + edge-fade), time track (play,
slider, relógio, chip da maré/termal) e interações (expandir, filtrar, URL,
limpar filtros, scrub).

## Defeito encontrado e corrigido

| # | Viewport | Antes | Depois | Fix |
|---|----------|-------|--------|-----|
| 1 | 360px (horas ligadas) | o **slider do time track estourava 7px** para fora do cartão do HUD — o `flex-1` não encolhia abaixo do min-content do `<input type="range">` (linha play + relógio + chip da maré + slider) | slider 100% dentro do cartão (109px, ≥60px mínimo de interação) | `MapTimeTrack.tsx` — `min-w-0` nas duas variantes (hud + floating/radar) |

## Verificado como OK (sem intervenção)

- **Alinhamento do header row** (label, rádios Mapa/Satélite, pesquisa, pill de
  contagem, sair) — uma linha, sem overflow, rádios ≥44px em todos os
  viewports; nenhum elemento não-scrollable fora do cartão.
- **Tira de camadas mobile** (~12 botões 44×44): scroll horizontal com
  edge-fade; **último botão alcançável** (verificado por scroll até ao fim)
  em 390px e 360px.
- **Linhas de filtro** (modalidade/nível/região): chips ≥44px abaixo de `lg`,
  «Limpar filtros» aparece ao filtrar e reseta o URL; expansão/colapso mobile
  correctos.
- **Time track**: play 44×44, relógio tabular, chip da maré 44px alinhado;
  scrub 22h→13h funciona; variante floating (radar carousel) com slider dentro
  do track em 390px.
- **Legenda vs HUD**: elevação dinâmica (`hudLift`) mantém a legenda acima do
  cartão (folga ≥12px) mesmo com horas ligadas.
- **Locale EN** em 360px: sem overflow (labels mais longas cabem).

## Testes

- **e2e** (`map-hours.spec.ts`, +1): slider das horas não ultrapassa o cartão
  do HUD em 360px (regressão do `min-w-0`).
- **Regressões na via CI**: `map-hours` + `map-currents` + `mapa-route` 14/14;
  `mobile-playtest` + `visual-ux-audit` 48/0; unit 1475/1475; `tsc` e lint
  limpos.
---

## Auditoria de Contraste e Acessibilidade (axe) — overlays do mapa

**Data:** 2026-09-10 | **Método:** axe-core (`scripts/audit/audit-map-axe.mjs`, 12 estados: 2 temas × 6 estados — default, popup, legenda expandida, HUD expandido, sheet, camadas) + sonda de contraste **por pixel renderizado** (`scripts/audit/audit-map-contrast.mjs`): screenshot composto e amostragem de 4 cantos do rect de cada texto dos overlays (legenda, HUD, controlos, popup, sheet, chips, atribuição), escolhendo o pixel mais distante da cor do texto, nos temas **dark** e **ocean** (light).

### Defeitos de contraste reais corrigidos

| # | Tema | Elemento | Antes | Depois | Fix |
|---|------|----------|-------|--------|-----|
| 1 | dark | Pill «Onshore» do popup (texto 10px `text-windDir-onshore` sobre cartão slate-800) | **3.89:1** (red-500) — FAIL AA | **5.27:1** (red-400) | `globals.css` — token dark `--windDir-onshore` 239 68 68 → 248 113 113 (red-400; igual ao `--score-poor` dark; usado também por ForecastTable/Compass/avisos → todos ganham) |
| 2 | ocean | Badge de score sobre a imagem do spot (sky-700 sobre pixel escuro) | **2.33:1** — FAIL AA | ≥4.5:1 sobre o chip sólido | `SpotPopupContent.tsx` — cluster do score num chip `bg-bg-elevated/95 + backdrop-blur-sm + shadow`; sem tint translúcido (`tokens.bg` removido — o tint de /15 escurecia o chip dark para ~4.15:1) |
| 3 | ocean | Rótulo do desporto sobre a imagem (fg-muted sobre pixel claro) | **3.12:1** — FAIL AA | ≥4.5:1 sobre o chip sólido | idem (o rótulo fica sobre o chip) |
| 4 | ocean | Pill «Onshore» (red-600) no card branco | **4.47:1** — FAIL AA por 0.03 | **6.47:1** (red-700; 4.57:1 no tint /20) | `globals.css` — token ocean `--windDir-onshore` 220 38 38 → 185 28 28 (red-700, igual ao `--score-poor` light) |
| 5 | ocean | Pill «Offshore» (green-600) — 3.3:1 em branco (não amostrado nos picks, mas mesmo defeito de classe) | **3.30:1** (calculado) — FAIL AA | **7.13:1** (green-800; 5.21:1 no tint /20) | `globals.css` — token ocean `--windDir-offshore` 22 163 74 → 22 101 52 (green-800; mesmo padrão «um degrau mais escuro para AA em chips tintados» já aplicado aos score colors) |

**Resultado pós-fix: 0 falhas de contraste em todos os 10 estados** (dark + ocean × 5 estados da sonda de pixel).

### Robustez da sonda (falhas reais vs. artefactos)

Duas correcções à sonda para só medir o que está realmente pintado:

1. **Subárvores `display:none`** (ex.: linhas de filtro desktop `hidden md:flex` no mobile) — textos com rect mensurável mas invisível; agora percorre ancestrais e ignora.
2. **Cantos fora do viewport / recortados** (ex.: pills de região fora da área visível da tira `overflow-x-auto` — `getImageData` fora da imagem devolve preto transparente) — cada ponto de amostragem é validado com `elementFromPoint` e clamp ao viewport; sem pontos válidos, o elemento é ignorado.

### Verificado como OK (axe + contraste)

- **axe-core: 0 violações** em 12 estados (2 temas × 6 estados), incluindo popup e sheet abertos.
- **Legenda, HUD, controlos, atribuição**: contraste AA em ambos os temas (medido por pixel sobre os tiles reais — o axe não consegue avaliar fundos de imagem).
- **Chips tintados a /20** (NewsCard, DawnPatrolBanner, WaterQualityBadge): melhorados pelos novos tokens sem intervenção directa.

### Testes

- **Unit** (`spotPopupContent.test.ts`, +1): o cluster do score renderiza o chip sólido (`bg-bg-elevated/95`, `backdrop-blur-sm`) e **não** o tint `bg-score-*/15` (contrato de contraste AA sobre a imagem).
- **Regressões na via CI**: `map-popup-ver-spot` + `axe-audit` + `map-touch-targets` + `map-currents` + `map-hours` + `mapa-route` **51/51**; `visual-ux-audit` + `mobile-playtest` **48/0** (3 skipped); unit **1476/1476**; `tsc` e lint limpos.

---

## Decisão de design — densidade dos filtros do HUD no desktop (≥1024px)

**Data:** 2026-09-10 | **Mockup interactivo:** `docs/hud-density-mockup.html` (5 variantes × 2 temas, com simulador de largura 1024–1440 e visualização do alvo de toque).

### Contexto

Em produção, as pills compactas dos filtros têm **36px no desktop** (`lg:min-h-[36px]`) e **44px abaixo de lg** (piso touch do projecto, WCAG 2.5.8/2.5.5). A pergunta: o desktop deve manter 36px?

### Dados medidos (fiel ao HUD real)

- 9 modalidades (Todos…Wakeboard) + 4 níveis + 8 regiões; **a linha de modalidades cabe sem scroll em 1024px e 1440px em todas as variantes** — o trade-off é apenas vertical e táctil, nunca de layout.
- 36px já cumpre WCAG 2.5.8 AA (mínimo 24px); 44px é o piso opcional do projecto (2.5.5 AAA).

### Variantes comparadas

| Opção | Visual | Alvo | Bloco filtros | Δ vs V0 |
|-------|--------|------|---------------|---------|
| **V0 — actual** | 36px | 36px | ~122px | — |
| **V1 — 44px uniforme** | 44px | 44px | ~146px | +24px |
| **V2 — 40px intermédio** | 40px | 40px | ~134px | +12px |
| **V3 — 36px + alvo 44px** | 36px | 44px* | ~122px | *inviável — ver nota |
| **V4 — toolbar segmentada** | 36px, 1 linha | — | ~48px | redesenho estrutural |

### V3 (hit-area invisível) — **não implementável**: correcção da recomendação

Testada em implementação: o Chromium **não faz hit-test de pseudo-elementos fora da border box** do elemento (verificado num caso mínimo isolado e no HUD real — `elementFromPoint` a 1px do rect acerta no botão, a 3px acerta no cartão, mesmo com `overflow: visible` e o pseudo pintado). Além disso, as linhas de chips são `overflow-x-auto`, que recortam qualquer extensão vertical. **O alvo de um chip é limitado pela altura da própria linha** — 36px visuais e 44px de alvo não podem coexistir numa linha de 36px.

### Implementado: **V3′ — 44px por omissão, 36px só em rato puro (`any-pointer: fine`)**

1. `.filter-pill-compact` / `.filter-row-action` em `globals.css` (camada utilities — vence qualquer `min-h-*` utility): **44px base** em todo o lado; `@media (min-width: 1024px) and (any-pointer: fine)` → 36px. Portáteis touch e tablets em paisagem (hoje caem no breakpoint de rato) ficam cobertos pelo piso; o desktop de rato mantém a densidade — custo +24px de bloco só em híbridos.
2. Testes: unit `filterPill.test.ts` (+4, contrato da classe-marcador); e2e `map-touch-targets` (+2 — rato puro 36px vs toque em desktop 44px; o `hasTouch` do Playwright emula `any-pointer: coarse`). Regressões CI: touch-targets 8/8, mapa/UX 62/0, unit 1496/1496.
3. Alternativa para uniformidade total: **V1** (44px em todo o lado). V2 (40px) não atinge o piso; V4 é uma mudança de arquitectura separada.

## Avaliação: colapso por omissão do HUD no desktop (2026-09-10)

**Pergunta:** o cartão HUD expandido no desktop devia colapsar por omissão para devolver ~28% do mapa?

**Medição** (`scripts/audit/audit-hud-footprint.mjs`, 6 viewports): o cartão expandido ocupa **204px** (228px touch) — no desktop **nunca houve colapso**: o handle era `md:hidden` e as rows de filtros `hidden md:flex` (sempre renderizadas). Cobertura do viewport do mapa:

| Viewport | Expandido | Header-only |
|---|---|---|
| 1440×900 | 29,7% | 13,4% |
| 1280×800 | 33,7% | 15,2% |
| 1024×768 | 35,2% | 15,9% |
| 1024×640 (portátil curto) | **43,1%** | 19,4% |

O problema real: num portátil 1024×640, quase metade do mapa estava sob o HUD. Alegado ~28% → medido 30–43% conforme viewport.

**Decisão (implementada):**
1. **Colapsado por omissão em todas as superfícies** — `useState(true)` já existia; o container de filtros passou de `'hidden md:flex'` para `'hidden md:hidden'` (idêntico ao mobile: compacto é o estado de entrada).
2. **Toggle no cabeçalho desktop** — o handle ganhou rótulo «Mostrar/Ocultar filtros» (≥md) com **contador de filtros activos** `(n)`; mantém o grabber mobile; alvo ≥44px; `aria-expanded` em todas as superfícies.
3. **Auto re-expand pós-mount** — se os filtros ficam sujos com o HUD colapsado (select nativo mobile; deep links/persistidos NÃO forçam expansão — primeira avaliação do effect ignorada, contador no toggle mostra o estado), as rows re-expandem para a mudança ser visível; só na transição para dirty («Limpar filtros» mantém colapsado).
4. **Sem persistência** — sessão começa sempre compacta (zero risco de hidratação; padrão SSR/first-paint igual).
5. Alinhamento: o toggle de filtros fica ancorado ao canto direito do cabeçalho no desktop (`md:ml-auto`), separado do cluster esquerdo (título + camadas + pesquisa + boia); no mobile mantém o fluxo do cabeçalho; o grabber saiu (o controlo compacto é chevron + aria-label, 44px).

**Custo da legenda:** hudLift (ResizeObserver sobre o HUD) segue a altura real — com HUD compacto a legenda desce ~104px, área de mapa ganha por cima e por baixo.

**Testes:** unit `mapHudCollapse.test.ts` (+4 — contrato de colapso); e2e novo `map-hud-collapse.spec.ts` (+5 — colapso/expansão desktop, orçamentos <16% colapsado e <36% expandido a 1440×900, legenda sem colisão, auto re-expand); `map-touch-targets` actualizado (3 testes expandem antes de medir); regressões: unit **1504/1504**, e2e **140 passed** (39 HUD-family + 101 adjacentes), lint e tsc limpos.
