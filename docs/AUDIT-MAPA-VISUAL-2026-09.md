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