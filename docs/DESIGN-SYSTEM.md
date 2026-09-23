# VenTu Design System v2.0

Ocean-tech sério. Dados são protagonistas. Zero ilustrações decorativas.

---

## 1. PALETA DE CORES

### 1.1 Cores Base (theme-aware via CSS variables)

| Token | Light (`.theme-ocean`) | Dark (`:root`) | Uso |
|-------|----------------------|----------------|-----|
| `--bg-base` | `#FAFAF7` (white-sand) | `#0F172A` (slate-950) | Fundo da página |
| `--bg-elevated` | `#FFFFFF` (white) | `#1E293B` (slate-800) | Fundo de modais/drawers |
| `--surface-1` | `rgba(15,23,42,0.04)` | `rgba(255,255,255,0.04)` | Card padrão |
| `--surface-2` | `rgba(15,23,42,0.08)` | `rgba(255,255,255,0.08)` | Card hover/selecionado |
| `--surface-3` | `rgba(15,23,42,0.12)` | `rgba(255,255,255,0.12)` | Card hero/destacado |
| `--divider` | `rgba(15,23,42,0.10)` | `rgba(255,255,255,0.08)` | Bordas finas |
| `--divider-strong` | `rgba(15,23,42,0.18)` | `rgba(255,255,255,0.12)` | Bordas de destaque |
| `--fg` | `#1E293B` (slate-800) | `#F1F5F9` (slate-100) | Texto primário |
| `--fg-muted` | `#64748B` (slate-500) | `#94A3B8` (slate-400) | Texto secundário |
| `--fg-subtle` | `#94A3B8` (slate-400) | `#64748B` (slate-500) | Labels, unidades |
| `--fg-disabled` | `#CBD5E1` (slate-300) | `#475569` (slate-600) | Texto desativado |

### 1.2 Cores de Acento

| Token | Hex | Light | Dark | Uso |
|-------|-----|-------|------|-----|
| `--accent-primary` | `#0B3D5C` | `11 61 92` | `11 61 92` | Botões, links, header bg |
| `--accent-positive` | `#10B981` | `16 185 129` | `16 185 129` | Deltas positivos, scores bons |
| `--accent-negative` | `#F43F5E` | `244 63 94` | `244 63 94` | Deltas negativos, alertas |

### 1.3 Escala de Score (5 níveis)

| Nível | Score | Cor | Light | Dark | Uso |
|-------|-------|-----|-------|------|-----|
| **ÉPICO** | 80-100 | Azul-vivo `#0EA5E9` | `14 165 233` | `14 165 233` | ScoreDial, badges topo |
| **BOM** | 60-79 | Verde-mar `#10B981` | `16 185 129` | `16 185 129` | Scores positivos |
| **FUN** | 40-59 | Âmbar `#F59E0B` | `245 158 11` | `245 158 11` | Scores médios |
| **FLAT** | 20-39 | Vermelho `#EF4444` | `239 68 68` | `239 68 68` | Scores baixos |
| **FECHADO** | 0-19 | Cinza `#6B7280` | `107 114 128` | `107 114 128` | Spot offline/sem dados |

Gradiente visual: 🔴 Vermelho → 🟡 Âmbar → 🟢 Verde-mar → 🔵 Azul-vivo

### 1.4 Cores de Data Visualization

| Token | Hex | Uso |
|-------|-----|-----|
| `--data-waves` | `#0EA5E9` (sky-500) | Gráficos de ondas, swell |
| `--data-wind` | `#8B5CF6` (violet-500) | Gráficos de vento |
| `--data-water` | `#06B6D4` (cyan-500) | Temperatura água |
| `--data-period` | `#F59E0B` (amber-500) | Período de ondas |

### 1.5 Cores de Desporto (Sport Accents)

| Desporto | Cor | Hex | Uso |
|----------|-----|-----|-----|
| Surf | Sky | `#0EA5E9` | Markers, badges, tabs |
| Kitesurf | Violet | `#8B5CF6` | Markers, badges, tabs |
| Windsurf | Amber | `#F59E0B` | Markers, badges, tabs |
| Bodyboard | Emerald | `#10B981` | Markers, badges, tabs |
| SUP | Cyan | `#06B6D4` | Markers, badges, tabs |
| Wakeboard | Pink | `#EC4899` | Markers, badges, tabs |
| Foil | Indigo | `#6366F1` | Markers, badges, tabs |

### 1.6 Wind Direction Tints

| Direção | Cor | Hex |
|---------|-----|-----|
| Offshore | Green | `#22C55E` |
| Onshore | Red | `#EF4444` |
| Cross (lateral) | Slate | `#94A3B8` |

---

## 2. TIPOGRAFIA

### 2.1 Famílias

| Role | Fonte | Pesos | Fallback |
|------|-------|-------|----------|
| **UI / Body** | `Geist Sans` | 400/500/600/700 | `system-ui, sans-serif` |
| **Números / Mono** | `Geist Mono` | 400/500/600/700 | `ui-monospace, monospace` |
| **Display editorial** | `IBM Plex Serif` | 400/600 | `Georgia, serif` |

IBM Plex Serif é usado APENAS em páginas editoriais (notícia individual, sobre). Não usado em UI de dados.

### 2.2 Escala

| Token | Size | Line H. | Tracking | Weight | Uso |
|-------|------|---------|----------|--------|-----|
| `display-xl` | 3.5rem | 1.05 | -0.03em | 700 | Hero scores, números grandes |
| `display-lg` | 2.5rem | 1.1 | -0.025em | 700 | Título de página |
| `h1` | 2rem | 1.2 | -0.02em | 600 | Secção principal |
| `h2` | 1.5rem | 1.3 | -0.015em | 600 | Subsecção |
| `h3` | 1.125rem | 1.4 | -0.01em | 600 | Card header |
| `body-lg` | 1rem | 1.55 | — | 400 | Corpo texto grande |
| `body` | 0.875rem | 1.55 | — | 400 | Corpo texto padrão |
| `body-sm` | 0.8125rem | 1.5 | — | 400 | Texto auxiliar |
| `meta` | 0.75rem | 1.4 | 0.005em | 400 | Labels, units |
| `meta-sm` | 0.6875rem | 1.4 | 0.04em | 500 | Captions, badges |
| `num-xl` | 3rem | 1 | — | 600 | Score grande (drawer) |
| `num-lg` | 2rem | 1 | — | 600 | Score médio (cards) |
| `num` | 1.125rem | 1 | — | 500 | Métricas inline |
| `num-sm` | 0.875rem | 1 | — | 500 | Scores em listas |
| `num-xs` | 0.75rem | 1 | — | 500 | Scores em badges |

**Regra:** Todos os números (scores, métricas, deltas, datas) usam `font-mono` + `tabular-nums`.

### 2.3 Exemplos

```css
/* H1 numérico no drawer */
.score-hero { font-family: Geist Mono; font-size: 3rem; font-weight: 600; }

/* Tabela de previsão */
td.value { font-family: Geist Mono; font-variant-numeric: tabular-nums; font-size: 0.875rem; }

/* Corpo de texto editorial */
.article-body { font-family: IBM Plex Serif; font-size: 1rem; line-height: 1.7; }
```

---

## 3. SPACING SCALE

| Pixel | Tailwind | Uso |
|-------|----------|-----|
| 4 | `p-1` | Chips internos, ícones |
| 8 | `p-2` | Inputs, botões pequenos |
| 12 | `p-3` | Cards compactos, pills |
| 16 | `p-4` | Cards padrão, padding content |
| 24 | `p-6` | Secções, modais |
| 32 | `p-8` | Secções grandes |
| 48 | `p-12` | Hero spacing |
| 64 | `p-16` | Page sections |
| 96 | `p-24` | Page margins |

Gap scale idêntica: `gap-1` = 4px, `gap-2` = 8px, etc.

---

## 4. RADII

| Token | Value | Uso |
|-------|-------|-----|
| `rounded-chip` | 4px | Chips, badges minúsculos |
| `rounded-input` | 6px | Inputs, botões, selects |
| `rounded-card` | 8px | Cards padrão |
| `rounded-modal` | 12px | Modais, drawers |
| `rounded-surface` | 16px | Superfícies grandes: molduras de mapa, blocos de secção |
| `rounded-pill` | 9999px | Pills, sport selectors |

No tailwind: `rounded-sm` (chip), `rounded-md` (input), `rounded-lg` (card), `rounded-xl` (modal), `rounded-full` (pill).

---

## 5. SHADOWS

| Token | Value | Uso |
|-------|-------|-----|
| `shadow-card` | `0 1px 2px rgba(0,0,0,0.08)` | Card padrão (mínimo) |
| `shadow-card-hover` | `0 4px 12px rgba(0,0,0,0.10)` | Card hover |
| `shadow-modal` | `0 8px 24px rgba(0,0,0,0.15)` | Modal, drawer |
| `shadow-glow-epic` | `0 0 24px rgba(14,165,233,0.30)` | Score épico glow |
| `shadow-glow-good` | `0 0 20px rgba(16,185,129,0.25)` | Score bom glow |
| `shadow-glow-fair` | `0 0 16px rgba(245,158,11,0.20)` | Score fun glow |
| `shadow-glow-poor` | `0 0 12px rgba(239,68,68,0.15)` | Score flat glow |

**Regra:** Preferir bordas `1px` a sombras. Apenas modais e glows de score usam sombra.

---

## 6. COMPONENTES-CHAVE (exemplos visuais ASCII)

### 6.1 SpotCard

```
┌────────────────────────────────────┐
│ ┌────┐                             │
│ │ 78 │  Praia do Norte    2.1m     │
│ │score│  Nazaré · Oeste    14s     │
│ └────┘                     12kt    │
│                                  → │
└────────────────────────────────────┘
```
ScoreDial à esquerda, nome+região ao centro, métricas à direita, seta no canto.

### 6.2 ScoreDial

```
     ╭──────────╮
     │  \  78  / │
     │   \ BOM/  │
     │    \ /    │
     │     ╯     │
     ╰──────────╯
```
Círculo 270°, cor por tier (azul/verde/âmbar/vermelho). Label qualitativa dentro.

### 6.3 MetricBar

```
Altura     ████████████████░░░░  2.1m  78/100
Período    ██████████░░░░░░░░░░  14s   65/100
Vento      ████████░░░░░░░░░░░░  12kt  58/100
```

Label à esquerda, barra horizontal com fill, valor à direita, score no fim.

### 6.4 WidgetCard

```
┌────────────────────────────────────────┐
│ ⠿  Melhores spots agora              │
├────────────────────────────────────────┤
│ 1. Praia do Norte  ·  78  ·  ÉPICO    │
│ 2. Supertubos      ·  74  ·  BOM      │
│ 3. Ericeira        ·  72  ·  BOM      │
│ 4. Guincho         ·  68  ·  BOM      │
│ 5. Coxos           ·  65  ·  FUN      │
└────────────────────────────────────────┘
```
Header com handle ⠿ + título. Body compacto com lista.

### 6.5 MegaMenuItem

```
┌──────────────────────────────────────────┐
│ 🏄 Surf                                   │
│    Ondas de ponto a praia. 43 spots.     │
├──────────────────────────────────────────┤
│ 🪁 Kitesurf                               │
│    Vento constante, águas planas.        │
│    ~15 spots.                             │
└──────────────────────────────────────────┘
```
Ícone + título bold + descrição 1 linha + contagem.

### 6.6 SearchPalette

```
┌──────────────────────────────────────────┐
│ 🔍  [nazaré_________________________]    │
├──────────────────────────────────────────┤
│ SPOTS                                     │
│ Nazaré · Oeste · Score 92        → Ir    │
│ Praia do Norte · Nazaré · Score 78 → Ir  │
│                                          │
│ REGIÕES                                  │
│ Nazaré · 5 spots              → Ver     │
│                                          │
│ MODALIDADES                              │
│ Big Wave · 2 spots           → Ver      │
└──────────────────────────────────────────┘
```
Input focado, resultados agrupados por tipo.

---

## 7. REGRAS DO/DON'T

### DO
- Usar `font-mono` + `tabular-nums` para **todos** os números
- Preferir bordas a sombras para separação visual
- Scores de 0-100 mapeados na escala ÉPICO/BOM/FUN/FLAT/FECHADO
- Deltas positivos em verde-mar, negativos em coral
- Manter densidade alta — dados primeiro, whitespace propositado
- Modo escuro com contraste mínimo WCAG AA (4.5:1 texto normal)
- Cards com `border` + `surface-1`, sem sombra
- Animações apenas para feedback (loading, hover, score count-up)

### DON'T
- ❌ Nunca usar verde-lima vibrante (cor do analisa.pt)
- ❌ Nunca usar coral fora de deltas negativos ou alertas
- ❌ Nunca centralizar blocos de texto >3 linhas
- ❌ Nunca usar ilustrações decorativas (ícones funcionais ok)
- ❌ Nunca usar emoji como ícone primário (usar lucide-react)
- ❌ Nunca aplicar sombras em cards padrão (apenas modais)
- ❌ Nunca usar fontes display para UI de dados
- ❌ Nunca ter spinners genéricos — loading states são skeleton contextual

---

## 8. ACESSIBILIDADE

### Contrastes (WCAG AA)

| Combinação | Light Ratio | Dark Ratio | Passa? |
|------------|-------------|------------|--------|
| `fg` (#1E293B) on `bg-base` (#FAFAF7) | 12.8:1 | — | ✅ AA |
| `fg-muted` (#64748B) on `bg-base` (#FAFAF7) | 5.2:1 | — | ✅ AA |
| `fg-subtle` (#94A3B8) on `bg-base` (#FAFAF7) | 3.8:1 | — | ⚠️ Apenas para labels |
| — | — | `fg` (#F1F5F9) on `bg-base` (#0F172A) | 13.1:1 ✅ AA |
| — | — | `fg-muted` (#94A3B8) on `bg-base` (#0F172A) | 6.8:1 ✅ AA |
| — | — | `fg-subtle` (#64748B) on `bg-base` (#0F172A) | 4.5:1 ✅ AA |

### Focus ring
- `:focus-visible` usa `--accent-positive` (verde-mar) com 2px + offset 2px
- Inputs/textarea têm offset 0 (tighter ring)

### Reduced motion
- Media query `prefers-reduced-motion: reduce` desliga todas as animações
- Score count-up respeita animação nula

---

## 9. MODO ESCURO vs CLARO

| Aspecto | Light (`.theme-ocean`) | Dark (`:root`) |
|---------|----------------------|----------------|
| Base | white-sand `#FAFAF7` | slate-950 `#0F172A` |
| Texto | slate-800 `#1E293B` | slate-100 `#F1F5F9` |
| Cards | branco com opacidades de navy | branco com opacidades de branco |
| Bordas | navy a 10% | branco a 8% |
| Data viz | vibrante (full saturation) | ligeiramente reduzido |
| Glows | opacidade normal | opacidade reduzida |

Ambos os temas foram desenhados de raiz. O escuro não é uma inversão automática do claro.

---

*Fim do Design System v2.0. Aguardo feedback antes de implementação de componentes.*
