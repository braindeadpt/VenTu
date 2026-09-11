# Fase 7.2 — Ocean Theme Palette (renamed from Coast)

## Estado
- `.theme-ocean` definida em `globals.css` com paleta white-sand (#FAFAF7).
- Shadow-glow-* convertidos para CSS variables em `tailwind.config.ts`.
- **Ativado por omissão no `<html>`** via `layout.tsx`.

## Teste manual
1. `npm run dev`
2. Abrir `http://localhost:3000/pt/`
3. DevTools → Elements → `<html>` → verificar classe `theme-ocean`
4. Site deve ficar com fundo white-sand (`#FAFAF7`), texto slate-800 (`#1E293B`)

## Problemas visuais conhecidos para Fase 7.3

Os componentes signature têm cores hardcoded em SVG que **não respeitam o tema**.

### ScoreGauge
- **Linha 160**: `stroke="rgb(255 255 255 / 0.08)"` na track SVG.
  - **Problema**: em Coast, fica invisível sobre fundo bege.
  - **Fix**: usar `rgb(var(--divider))` ou `rgb(var(--fg-subtle) / 0.1)`.

### WaveShape
- **Linhas 124, 127, 129**: `strokeColor: '#60a5fa'` (blue-400) hardcoded.
  - **Problema**: não muda para `blue-600` em Coast.
  - **Fix**: usar `rgb(var(--data-waves))` ou ler do CSS.
- **Linhas 211-212**: gradient stops com `rgb(255 255 255 / ...)`.
  - **Problema**: em Coast, o gradient não desaparece suavemente — deixa uma mancha branca.
  - **Fix**: usar `rgb(var(--bg-base) / ...)` ou `rgb(var(--fg) / ...)`.
- **Linha 240**: `stroke="rgb(255 255 255 / 0.08)"` na base line.
  - **Fix**: `rgb(var(--divider))`.

### WindCompass
- **Linhas 283, 338**: `stroke="rgb(255 255 255 / ...)` em círculo e ticks.
  - **Fix**: `rgb(var(--divider))`.
- **Linha 349**: `stroke="rgb(251 191 36 / 0.4)"` em gust arc (amber-400).
  - **Fix**: `rgb(var(--data-wind) / 0.4)`.

### SwellRadar
- **Linhas 265-268**: `windColor` com hex hardcoded (`#22c55e`, `#ef4444`, `#94a3b8`, `#fbbf24`).
  - **Fix**: usar tokens via CSS ou função helper.
- **Linha 271**: `swellColor = '#60a5fa'`.
  - **Fix**: `rgb(var(--data-waves))`.
- **Linhas 279-280**: `rgb(255 255 255 / 0.65)` e `rgb(255 255 255 / 0.45)` para texto.
  - **Fix**: `rgb(var(--fg-muted))` e `rgb(var(--fg-subtle))`.
- **Linhas 318, 320, 327, 335, 352**: múltiplos fills/strokes com `rgb(255 255 255 / ...)`.
  - **Fix**: substituir por tokens semânticos (`--divider`, `--surface-1`, etc.).
- **Linha 385**: `fill="rgb(255 255 255 / 0.9)" stroke="#09090b"`.
  - **Fix**: `fill="rgb(var(--fg))" stroke="rgb(var(--bg-base))"`.

### ForecastTable (Recharts)
- **Linhas 33-47**: cores hardcoded `#3b82f6`, `#f59e0b`, `rgba(255,255,255,...)`.
  - **Problema**: Recharts não lê CSS variables diretamente.
  - **Fix**: criar um wrapper que leia as vars via `getComputedStyle` e passe como props, ou usar `<style>` inline com vars.

### Legacy components
- `.glass-card` e `.glass-card-strong` em `globals.css` usam `bg-white/5` e `border-white/10`.
  - **Problema**: em Coast, o glassmorphism fica estranho.
  - **Fix**: migrar para tokens semânticos ou marcar como não suportados em Coast.

## Recomendação para Fase 7.3

Criar um helper `useThemeColors()` que leia as CSS variables via `getComputedStyle` e retorne os valores como strings hex/rgb. Usar em todos os componentes signature que precisam de cores dinâmicas em SVG/canvas.
