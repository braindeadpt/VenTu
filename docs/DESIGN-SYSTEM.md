# VenTu Design System v6.0 «Atlântico»

Ferramenta de decisão costeira para desportos de ondas e vento em Portugal.
Os dados são protagonistas; a identidade é o Atlântico ao amanhecer —
azul-marinho profundo, névoa fria, solo e gelo como acentos cirúrgicos.

Fonte canónica das cores: `docs/design/maquetes/v6-atlantico/cores.md`
(todas as tabelas de contraste desta página derivam dela).
Implementação: `src/app/globals.css`, `tailwind.config.ts`, `src/lib/nota.ts`,
`src/lib/sportScore.ts`. Tokens de banda têm **dois caminhos de consumo** com a
mesma paleta: `getScoreTokens`/`scoreThresholds` (classes Tailwind — superfícies
clássicas) e `V6_BANDAS`/`bandaVars` em `src/lib/v6Tokens.ts` (superfícies v6 —
a régua de 48 h pinta-se por aqui). Uma alteração de paleta tem de passar nos dois.

> Versões anteriores (v2.0: slate/IBM Plex Serif/escala 0–100/ÉPICO-BOM-FUN)
> estão **revogadas**. Não usar `#FAFAF7`, `#0F172A`, `#0B3D5C`, `#0EA5E9`,
> `Space Grotesk` como display, nem a escala ÉPICO/BOM/FUN/FLAT/FECHADO.

---

## 1. PALETA DE CORES

Dois temas sobre os mesmos tokens. O escuro é o default (`:root`);
`.theme-ocean` no `<html>` activa a variante clara «Sol».

**Importante:** as superfícies v6 (`.v6`, `.v6h`, cabeçalho `[data-v6]` e
`[data-pele='v6']`) são **sempre escuras**, mesmo com `.theme-ocean` activo —
o tema claro nunca as afecta (ver `globals.css`, selects de superfícies v6).

### 1.1 Superfícies e tinta (dark `:root` — «Atlântico»)

| Token | Hex | RGB | Uso |
|-------|-----|-----|-----|
| `--bg-base` | `#030E18` abismo | `3 14 24` | Fundo da página |
| `--bg-elevated` | `#071B2C` fundo | `7 27 44` | Modais, drawers, headers |
| `--surface-3` | `#0C2A42` mar | `12 42 66` | Card hero/destacado |
| `--surface-1/2` | espuma `/0.04` `/0.08` | `243 248 251` | Cards padrão/hover |
| `--divider` | `#1E4361` linha | `30 67 97` | Bordas finas |
| `--divider-strong` | `#38698E` | `56 105 142` | Bordas de destaque |
| `--fg` | `#F3F8FB` espuma | `243 248 251` | Texto primário (18.18:1) |
| `--fg-muted` | `#A9C2D4` névoa | `169 194 212` | Meta, legendas (10.51:1) |
| `--fg-subtle` | `#97B2C6` | `151 178 198` | Secundário (8.2:1) |
| `--fg-disabled` | `#56677B` noite | `86 103 123` | Desativado |
| `--sol` | `#FFC93C` | — | Acento quente: marca VEN+TU, sol/dia, highlights |
| `--gelo` | `#7FE7FF` | — | Acento frio: água, realces gelados |

### 1.2 Variante clara «Sol» (`.theme-ocean`)

| Token | Hex | Uso |
|-------|-----|-----|
| `--bg-base` | `#EEF4F8` | Fundo claro |
| `--bg-elevated` | `#FFFFFF` | Superfícies elevadas |
| `--fg` | `#04131F` | Texto (16.93:1) |
| `--fg-muted` / `--fg-subtle` | `#38526A` | Meta/secundário (8.13:1) |
| `--sol` | `#9A6A00` | Acento quente AA (4.73:1) |
| `--gelo` | `#005F8A` | Acento frio AA (6.99:1) |
| `--accent` | `0 95 138` (`#005F8A`) | Accent primário claro |

No tema claro as **bandas de score aparecem sempre dentro do fill** — texto
solto na cor da banda falha em fundo claro (ex.: «Muito bom» `#FFF07A`
sobre branco = 1.1:1). Usar `--score-*-text` (tintas AA escuras) para texto.

### 1.3 Acento primário (`--accent`)

| Tema | Hex | RGB | Uso |
|------|-----|-----|-----|
| Dark | `#FFC93C` sol | `255 201 60` | CTA primário, Dawn Patrol |
| Light | `#005F8A` gelo | `0 95 138` | Idem em `.theme-ocean` |

`--accent-hover` / `--accent-active` são os estados hover/active.
Usar accent para: CTA primário (hero, SignupNudge, Dawn Patrol), marca
`VEN`+`TU`, ícones sol e a pill «Ir ao mapa» na nav.
**Não** usar accent como cor de dados, de banda de score ou de alerta —
esses têm tokens próprios (`--score-*`, `--alert-*`).

---

## 2. ESCALA DA NOTA (/10) — a escala sagrada

O motor calcula 0–100 (`sportScore.ts`); **tudo o que a UI mostra passa por
`src/lib/nota.ts`** e sai como nota inteira `/10` (`scoreToNota`).

```
nota = round(score / 10)          inteira 0–10, NaN/∞ → 0
bandas sobre a nota (arredonda primeiro, classifica depois):
  Muito bom (epic) ≥ 9   Bom (good) ≥ 7   Dá (fair) ≥ 5
  Fraco (poor)    ≥ 3   Não dá (closed) < 3
`noite` = fora das horas de luz (o motor v6 marca `n == null && !av.fora`);
`semDados` = previsão em falta/offline — são **dois estados distintos** em
`notaUnica.ts` e a régua de 48 h apresenta-os separadamente. Nenhum é «nota».
```

Limiares em 0–100: `nota ≥ n` ⇔ `score ≥ 10n − 5` (`notaMinScore`).
Assim «score ≥ 65» e «nota ≥ 7 (Bom)» nunca discordam.

### 2.1 Bandas — fills, tintas e texto

| Banda | Nota | Tier token | Fill | Tinta sobre fill | Texto AA sobre superfície |
|-------|------|-----------|------|------------------|---------------------------|
| Muito bom | ≥ 9 | `epic` | `#FFF07A` | `#030E18` (16.10:1) | `--score-epic-text` |
| Bom | ≥ 7 | `good` | `#40DCD0` | `#030E18` (11.06:1) | `--score-good-text` |
| Dá | ≥ 5 | `fair` | `#C99E2A` | `#030E18` (7.52:1) | `--score-fair-text` |
| Fraco | ≥ 3 | `poor` | `#4479EE` | `#030E18` (4.66:1) | `--score-poor-text` |
| Não dá | < 3 | `closed` | `#A8464A` | `#FFFFFF` (5.77:1) | `--score-closed-text` |
| Noite | — | `night` | `#56677B` | `#FFFFFF` (5.80:1) | `--score-night-ink` |

Classes Tailwind: `bg-score-{tier}`, `text-score-{tier}-ink` (tinta sobre
fill), `text-score-{tier}-text` (texto AA solto na superfície),
`bg-score-{tier}/15` + `border-score-{tier}/25` (tint suave legado).
Em `.theme-ocean` as classes `text-score-*` são remapeadas para as tintas
escuras AA (`#785800`, `#006B64`, `#7D5900`, `#1D4ED8`, `#992D32`).

### 2.2 Regras de uso da cor de banda como TEXTO (cores.md)

A cor da banda só aparece como texto em números **≥ 24 px** (≥ 3:1 sobre o
fundo escuro) — regra codificada em `BANDAS_TEXTO_SO_GRANDE` (`v6Tokens.ts`:
`nao`, `fraco`, `noite`). Texto pequeno com cor de banda exige ≥ 4.5:1; abaixo
disso a banda aparece como **fill com a sua tinta** (`badge`: `bg-score-*` +
`text-score-*-ink`). Sobre o fundo mar `#0C2A42`, «Não dá» (2.55:1) e «Noite»
(2.54:1) ficam abaixo de 3:1 **a qualquer tamanho** — nessas superfícies são
sempre fill+tinta.

| Banda | sobre abismo `#030E18` | sobre fundo `#071B2C` | sobre mar `#0C2A42` | Texto permitido |
|-------|------------------------|-----------------------|---------------------|-----------------|
| Não dá | 3.37 | 3.03 | 2.55 | ≥ 24 px só em abismo/fundo; no mar sempre fill+tinta |
| Fraco | 4.83 | 4.34 | 3.66 | só ≥ 24 px |
| Dá | 7.79 | 6.99 | 5.90 | qualquer tamanho |
| Bom | 11.45 | 10.29 | 8.67 | qualquer tamanho |
| Muito bom | 16.67 | 14.97 | 12.63 | qualquer tamanho |
| Noite | 3.35 | 3.01 | 2.54 | ≥ 24 px só em abismo/fundo; no mar sempre fill+tinta |

### 2.3 Contraste do texto dentro do fill (daltonismo-safe)

Escala verificada com Machado/Oliveira/Fernandes (2009), severidade 1.0:
ΔE2000 mínimo entre bandas vizinhas = **26.5** (protanopia) — todas ≥ 20.
Luminância monotónica nas três visões (normal, deuteranopia, protanopia).

### 2.4 ScoreBadge (padrão)

Pill `rounded-pill` + `font-mono tabular-nums`: número `/10` inteiro à
esquerda, label da banda à direita (`font-sans`; na banda «Muito bom» o
label usa `font-display`). Fill = `tokens.badge` (`bg-score-*` +
`text-score-*-ink`); glow `shadow-glow-*` apenas em `epic`/`good`.
Sempre via `getScoreTokens(score)` / `scoreToNota` — nunca cor à mão.

### 2.5 Alertas ≠ bandas de score

Erros, offline, avisos de segurança e estados degradados **nunca** usam
cores de banda (`--score-poor` incluído — era o bug da v2). Usam os tokens
dedicados `--alert-*` (§3). Azul `#4479EE` é «Fraco», não é «erro».

---

## 3. TOKENS DE ALERTA (`--alert-*`)

Separados das bandas desde a v6 (#461). Erros, offline, avisos IPMA/segurança:

| Token | Dark | Light (`.theme-ocean`) | Uso |
|-------|------|------------------------|-----|
| `--alert-danger` | `#F87171` (6.4:1) | `#B91C1C` (6.5:1) | Erros, offline, falhas |
| `--alert-warn` | `#F97316` (6.2:1) | `#B45309` | Fill/borda de aviso |
| `--alert-orange-text` | `#F97316` | `#9A3412` (5.8:1 sobre tint /15) | Texto de aviso em tint |
| `--alert-warn-text` | `#FFC93C` (11.4:1) | `#92400E` (7.1:1) | Texto de aviso AA |

Classes: `text-alert-danger`, `text-alert-warn-text`,
`text-alert-orange-text`, `bg-alert-warn`, `border-alert-*`.

---

## 4. DADOS E DESPORTOS

### 4.1 Cores de data visualization (`--data-*`)

| Token | Dark | Light | Uso |
|-------|------|-------|-----|
| `--data-waves` | `#7FE7FF` gelo | `#005F8A` | Ondas, swell |
| `--data-wind` | violet-400 | violet-700 | Vento |
| `--data-water` | `#40DCD0` | cyan-700 | Temperatura da água |
| `--data-period` | `#FFC93C` sol | `#9A6A00` | Período de ondas |

### 4.2 Desportos (`--sport-*`)

| Desporto | Dark | Light |
|----------|------|-------|
| Surf | gelo `#7FE7FF` | `#005F8A` |
| Kitesurf | violet-400 | violet-700 |
| Windsurf | sol `#FFC93C` | `#92400E` |
| Bodyboard | `#40DCD0` | `#065F46` |
| SUP | cyan-400 | cyan-700 |
| Wakeboard | pink-400 | `#BE123C` |
| Foil | indigo-400 | `#4338CA` |

Classes: `text-sport-*`, `bg-sport-*` — markers, badges, tabs. Reusar,
nunca inventar novos matizes.

### 4.3 Direção do vento (`--windDir-*`)

| Direção | Dark | Light |
|---------|------|-------|
| Offshore | green-500 | `#166534` |
| Onshore | red-400 | `#B91C1C` |
| Cross | névoa | `#38526A` |

### 4.4 Daypart (`data-daypart` no `<html>`)

18h–21h PT aplica `data-daypart='sunset'`: tinta ambiente `--daypart-tint`
(gelo dark / `#005F8A` claro) em gradientes do header e do hero — **exceto**
cabeçalhos v6 (`[data-pele-cabecalho='v6']`, `[data-v6='home']`), que mantêm
fundo sólido.

---

## 5. TIPOGRAFIA

Fontes auto-alojadas em `src/styles/v6-fontes.css` (Barlow + Barlow
Condensed, SIL OFL, woff2 latin + latin-ext, `font-display: swap`),
carregadas **globalmente** em todas as rotas desde a v6 (#461).

| Role | Fonte | Classe | Notas |
|------|-------|-------|-------|
| **UI / Body** | `Barlow` | `font-sans` | UI, parágrafos, labels (fallback Geist Sans → system-ui) |
| **Display** | `Barlow Condensed` | `font-display` | Headlines hero, nomes de spot, label «Muito bom», números grandes |
| **Data** | `Geist Mono` | `font-mono` | Scores em tabela, métricas, `tabular-nums` por defeito |
| Editorial | `Georgia` | `font-serif` | Reservado (não usar em UI de dados) |

`Space Grotesk` (`--font-display` via `next/font`) permanece apenas como
fallback tardio da stack `font-display`; **não** é a display oficial.
`IBM Plex Serif` foi removida do produto.

### 5.1 Escala

| Token | Size | Line H. | Tracking | Weight | Uso |
|-------|------|---------|----------|--------|-----|
| `display-xl` | 3.5rem | 1.05 | -0.03em | 700 | Hero scores, números grandes |
| `display-lg` | 2.5rem | 1.1 | -0.025em | 700 | Título de página |
| `h1` | 2rem | 1.2 | -0.02em | 600 | Secção principal |
| `h2` | 1.5rem | 1.3 | -0.015em | 600 | Subsecção |
| `h3` | 1.125rem | 1.4 | -0.01em | 600 | Card header |
| `body-lg` | 1rem | 1.55 | — | 400 | Corpo texto grande |
| `body` | 0.875rem | 1.55 | — | 400 | Corpo padrão |
| `body-sm` | 0.8125rem | 1.5 | — | 400 | Texto auxiliar |
| `meta` | 0.75rem | 1.4 | 0.005em | 400 | Labels, units |
| `meta-sm` | 0.6875rem | 1.4 | 0.04em | 500 | Captions, badges |
| `meta-xs` | 0.625rem | 1.4 | 0.05em | 500 | Micro-captions |
| `num-xl` | 3rem | 1 | — | 600 | Score grande |
| `num-lg` | 2rem | 1 | — | 600 | Score médio |
| `num` | 1.125rem | 1 | — | 500 | Métricas inline |
| `num-sm` | 0.875rem | 1 | — | 500 | Scores em listas |
| `num-xs` | 0.75rem | 1 | — | 500 | Scores em badges |

**Regra:** todos os números (notas, métricas, deltas, datas) usam
`font-mono` + `tabular-nums` (já default em `.font-mono`).

---

## 6. SPACING, RADII E SOMBRAS

### 6.1 Spacing (só esta escala)

| Pixel | Tailwind | Uso |
|-------|----------|-----|
| 4 | `p-1` | Chips internos, ícones |
| 8 | `p-2` | Inputs, botões pequenos |
| 12 | `p-3` | Cards compactos, pills |
| 16 | `p-4` | Cards padrão, padding |
| 24 | `p-6` | Secções, modais |
| 32 | `p-8` | Secções grandes |
| 48 | `p-12` | Hero spacing |
| 64 | `p-16` | Page sections |
| 96 | `p-24` | Page margins |

### 6.2 Radii

| Token | Value | Uso |
|-------|-------|-----|
| `rounded-chip` | 4px | Chips, badges minúsculos |
| `rounded-input` | 6px | Inputs, botões, selects |
| `rounded-card` | 8px | Cards padrão |
| `rounded-modal` | 12px | Modais, drawers |
| `rounded-surface` | 16px | Molduras de mapa, blocos de secção |
| `rounded-pill` | 9999px | Pills, ScoreBadge, sport selectors |

### 6.3 Sombras

| Token | Value | Uso |
|-------|-------|-----|
| `shadow-card` | `0 1px 2px / 0.2 + 0 1px 3px / 0.15` | Card padrão |
| `shadow-card-hover` | `0 8px 24px -4px / 0.3` | Card hover |
| `shadow-modal` | idem hover | Modais, drawers |
| `shadow-inset-divider` | `inset 0 -1px` | Hairline interior |
| `shadow-glow-{tier}` | `0 0 32px -4px rgb(var(--score-*) / .45)` | Glow de score (epic/good na UI) |

**Regra:** preferir bordas `1px` a sombras. Apenas modais e glows de score
usam sombra; glows só em `epic`/`good` no `ScoreBadge`.

---

## 7. COMPONENTES-CHAVE

### 7.1 ScoreBadge

```
┌─────────────────────────────┐
│ [ 9  Muito bom ]            │  ← fill #FFF07A, tinta #030E18, font-mono
└─────────────────────────────┘
```
Pill `rounded-pill`, `font-mono tabular-nums`, `tokens.badge`
(`bg-score-*` + `text-score-*-ink`). Glow `shadow-glow-*` só em epic/good.
Label em `font-sans` (epic → `font-display`). Sempre `/10` inteiro.

### 7.2 SpotListCard

Card `card-1`/`card-2` + `ScoreBadge` + `SpotImage` opcional + `tierPhrase`
no hover. Versão `compact` remove `ConfidenceBadge` (máx. densidade).
Um só componente de card de spot — não criar variações ad-hoc.

### 7.3 FilterPill / `.filter-pill-compact`

`pill-ghost` inativo / `pill-active` activo. `.filter-pill-compact` dá
44 px por omissão e 36 px só em `≥1024px` **e** `any-pointer: fine`
(densidade desktop com rato). Alvos de toque ≥ 44 px em mobile.

### 7.4 Header / Footer v6

Marca `VEN`+`TU` em `--sol` (dark) / `--sol` claro. Nav desktop usa
`.filter-pill-compact`. `ThemeToggle` escondido na homepage
(`[data-v6='home']`). Header v6 tem fundo sólido mesmo ao pôr-do-sol.

### 7.5 Superfícies v6

Três raízes escuras fixas — **independentes de `.theme-ocean`**:
`.v6` (spot page), `.v6h` (homepage), `[data-pele='v6']` (mapa).
Tokens de banda/alerta são remapeados dentro delas para os valores
escuros AA mesmo quando o utilizador escolhe o tema claro.

### 7.6 Map markers

Pins/markers usam `getScoreTokens`/`--score-*` — a cor do marcador tem de
bater com o badge da mesma nota. `mapMarkers.ts`/`mapWindArrow.ts` usam
`rgb(var(--score-*-ink))` para texto/pin em fill de banda.

### 7.7 Regua48h / tábuas de previsão

Números em `font-mono tabular-nums`; célula de hora/note por banda via
fill+tinta; tooltip `.r-tip` abaixo da faixa; dias/meses localizados via
`formatHourLabel` (5 locales).

---

## 8. REGRAS DO / DON'T

### DO
- Usar `getScoreTokens(score)` / `scoreToNota` / `nota.ts` para **toda** a
  linguagem de score; nunca hex manual
- `font-mono` + `tabular-nums` para todos os números
- Preferir bordas a sombras; sombra só em modal e glow epic/good
- Nota `/10` inteira; bandas pelas notas (≥9/≥7/≥5/≥3/<3), não por score cru
- Alertas/erros/offline com tokens `--alert-*`, nunca cores de banda
- Bandas daltonismo-safe (verificadas em `cores.md`); `Noite` para sem-dados
- Manter densidade alta — dados primeiro, whitespace propositado
- Contraste WCAG AA (4.5:1 texto normal); alvos ≥ 44 px em toque
- Animações só para feedback (hover, loading, count-up)
- PT-PT canónico na copy (ver `ventu-i18n-voice`); 5 locales pt/en/es/de/fr

### DON'T
- ❌ Nunca usar verde-lima vibrante, roxo SaaS, gradientes arco-íris,
  glassmorphism, blobs decorativos, fotos stock de surfistas
- ❌ Nunca usar cores de banda para erros/avisos (azul `#4479EE` é «Fraco»)
- ❌ Nunca usar a escala 0–100 ou ÉPICO/BOM/FUN/FLAT/FECHADO na UI
- ❌ Nunca mostrar score como 0–100 ao utilizador — sempre `/10`
- ❌ Nunca inventar matizes fora dos tokens (`--sport-*`, `--score-*`,
  `--data-*`, `--alert-*`, `--accent`, `--sol`, `--gelo`)
- ❌ Nunca usar IBM Plex Serif, Space Grotesk ou Inter como display/body
- ❌ Nunca emojis como ícone primário (lucide-react); nunca ícones de
  conjuntos mistos
- ❌ Nunca `UTC` cru na UI — hora local do spot via `DATE_LOCALE`
- ❌ Nunca sombras em cards padrão; nunca spinners genéricos (skeleton
  contextual); nunca animações contínuas na home
- ❌ Nunca centralizar blocos de texto >3 linhas; nunca ilustrações
  decorativas (ícones funcionais ok)

---

## 9. ACESSIBILIDADE

### 9.1 Contrastes (de `cores.md`, WCAG 2.x)

Dark (`:root`):

| Par | Contraste | Mínimo |
|-----|-----------|--------|
| espuma `#F3F8FB` / abismo `#030E18` | 18.18 ✅ | 4.5 |
| espuma / fundo `#071B2C` | 16.33 ✅ | 4.5 |
| espuma / mar `#0C2A42` | 13.77 ✅ | 4.5 |
| névoa `#A9C2D4` / abismo | 10.51 ✅ | 4.5 |
| névoa / fundo | 9.44 ✅ | 4.5 |
| névoa / mar | 7.97 ✅ | 4.5 |
| sol `#FFC93C` / abismo | 12.66 ✅ | 4.5 |
| gelo `#7FE7FF` / fundo | 12.29 ✅ | 4.5 |
| ink `#04131F` / sol | 12.23 ✅ | 4.5 |

Claro (`.theme-ocean`):

| Par | Contraste |
|-----|-----------|
| `#04131F` / `#EEF4F8` | 16.93 ✅ |
| `#04131F` / `#FFFFFF` | 18.78 ✅ |
| `#38526A` / `#FFFFFF` | 8.13 ✅ |
| `#38526A` / `#EEF4F8` | 7.33 ✅ |
| `#9A6A00` / `#FFFFFF` | 4.73 ✅ |
| `#005F8A` / `#FFFFFF` | 6.99 ✅ |

Texto de banda sobre superfície: ver tabela §2.2 — abaixo de 4.5:1 só ≥ 24 px.

### 9.2 Foco, movimento e toque

- `:focus-visible` com outline visível (globals.css); inputs com offset 0
- `prefers-reduced-motion` desliga animações; count-up fica instantâneo
- Alvos de toque ≥ 44 px (ver §7.3); marcadores Leaflet 24×24 são exceção
  documentada (alvo = mapa; controlos do mapa cumprem 44 px)
- Diálogos `aria-modal` cumprem o contrato completo (foco, trap, Escape)
- Guards: `tests/e2e/a11y-touch-targets.spec.ts`, `a11y-login-modal.spec.ts`

---

## 10. MODO ESCURO vs CLARO

| Aspecto | Dark (`:root`) | Light (`.theme-ocean` «Sol») |
|---------|----------------|------------------------------|
| Base | abismo `#030E18` | `#EEF4F8` |
| Elevado | fundo `#071B2C` | `#FFFFFF` |
| Texto | espuma `#F3F8FB` | `#04131F` |
| Meta | névoa `#A9C2D4` | `#38526A` |
| Accent | sol `#FFC93C` | gelo `#005F8A` |
| Bandas de score | fills idênticos | fills idênticos |
| Texto de banda | `--score-*-text` claras | `--score-*-text` escuras AA |
| Superfícies v6 (`.v6`/`.v6h`/`[data-pele]`) | sempre escuras | sempre escuras |

O claro não é uma inversão automática do escuro — os dois foram desenhados
de raiz (`cores.md` secção «variante clara»).

---

*Fim do Design System v6.0 «Atlântico». Fonte de verdade dos valores:
`src/app/globals.css`, `tailwind.config.ts`, `src/lib/nota.ts`,
`src/lib/sportScore.ts`, `docs/design/maquetes/v6-atlantico/cores.md`.*
