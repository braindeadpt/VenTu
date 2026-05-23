# VenTu — Audit Visual, Design, Mobile & Funcionalidades

Data: 2026-05-23 | Auditor: Cascade AI

---

## Resumo Executivo

O projecto tem um design system sólido (tokens CSS, tailwind config, ScoreGauge, WaveShape) e uma estrutura profissional. Identifico abaixo os **problemas concretos** e **melhoramentos** organizados por prioridade.

---

## 🔴 Problemas Críticos (Fixes necessários)

### P1. NewsCard usa `glass-card` (classe LEGACY deprecated)
**Ficheiro:** `src/components/news/NewsCard.tsx:81`
**Problema:** O variant `grid` do NewsCard usa `glass-card` que é declarado no globals.css como `/* LEGACY (deprecated) */` com `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl`. Esta classe usa cores hard-coded (`white/5`, `white/10`) que **não respeitam o tema light** — no tema ocean (light), os cards de notícias ficam praticamente invisíveis (branco sobre branco-areia).
**Fix:** Substituir `glass-card` por `card-1` (semântico, theme-aware).

### P2. Footer usa `as any` na tradução
**Ficheiro:** `src/components/layout/Footer.tsx:12`
**Problema:** `getTranslation(locale as any)` — perde tipagem e pode crashar com locale inválido.
**Fix:** Usar `getTranslation(locale as 'pt' | 'en')` (consistente com o resto do codebase).

### P3. Status Bar escondida no mobile pelo ticker
**Ficheiro:** `src/app/[locale]/page.tsx`
**Problema:** Status bar com `sticky top-16` + Ticker logo abaixo + Dawn Patrol banner — em ecrãs pequenos (<375px), o stack vertical ocupa >50% do viewport antes de chegar ao conteúdo principal. O utilizador vê: header (64px) + status bar (40px) + dawn patrol (~80px) + ticker (~40px) = **~224px fixos** antes do hero.
**Fix:** Esconder status bar em mobile (`hidden md:flex`) ou colapsá-la no dawn patrol banner.

### P4. `SpotGridClient` — filter bar `md:sticky md:top-0` colide com header `fixed top-0 z-50`
**Ficheiro:** `src/components/spots/SpotGridClient.tsx:279`
**Problema:** O filter bar é `md:sticky md:top-0 md:z-40` mas o header é `fixed top-0 z-50 h-16`. O sticky bar fica ATRÁS do header. Deveria ser `md:top-16` (abaixo do header).
**Fix:** Mudar para `md:top-16`.

### P5. Homepage hero `min-h-[50vh]` excessivo em mobile
**Ficheiro:** `src/app/[locale]/page.tsx:204`
**Problema:** `min-h-[50vh] md:min-h-[40vh]` — em telemóvel com 667px de viewport, o hero ocupa no mínimo 333px + os 224px de chrome acima = **557px antes do grid**. O utilizador tem de scroll para ver qualquer spot card.
**Fix:** Reduzir para `min-h-[30vh] md:min-h-[40vh]` ou usar `py-8` sem min-height em mobile.

### P6. ForecastTable indentation inconsistente
**Ficheiro:** `src/components/weather/ForecastTable.tsx:37`
**Problema:** `windGust` tem indentation errada (espaço a mais no início da linha). Não afecta runtime mas é desalinhamento de código.
**Fix:** Alinhar com as outras propriedades.

---

## 🟡 Melhoramentos de Design (Alta prioridade visual)

### M1. Transição do mobile menu (sem animação)
**Ficheiro:** `src/components/layout/Header.tsx:176`
**Problema:** O mobile menu faz render condicional (`{mobileMenuOpen && ...}`) — aparece/desaparece instantaneamente sem animação. Todas as apps profissionais (Surfline, Windy, Magic Seaweed) usam slide-down animado.
**Melhoria:** Usar `max-height` transition ou `framer-motion` `AnimatePresence`.

### M2. Homepage search duplicado
**Ficheiros:** `HomepageSearch.tsx` + `SearchPalette.tsx`
**Problema:** Existem 2 implementações de search modal completamente diferentes. O `HomepageSearch` (hero) é mais simples (sem news/regiões), o `SearchPalette` (header) é completo com news/modalidades/regiões. Inconsistência visual e funcional.
**Melhoria:** Unificar — o botão no hero deveria abrir o mesmo `SearchPalette` do header.

### M3. Hero score display — "Top score: Nazaré 85/100 · Surf" não tem link
**Ficheiro:** `src/app/[locale]/page.tsx:228-233`
**Problema:** O sub-line do hero mostra o melhor spot + score mas não é clicável. O utilizador vê "Top score: Nazaré 85/100" e não pode ir directo ao spot.
**Melhoria:** Envolver em `<Link>` para o spot.

### M4. ScoreGauge viewBox cortado
**Ficheiro:** `src/components/ui/ScoreGauge.tsx:149`
**Problema:** `viewBox="0 0 100 85"` com circle `cy="40"` e radius até 42 — o arco pode ser cortado nos extremos (stroke-linecap round + strokeWidth 10 em `lg`). O ponto inferior da gauge pode ser clipado.
**Melhoria:** Ajustar viewBox para `0 0 100 90` ou garantir padding no SVG.

### M5. Drawer bottom-sheet — sem drag-to-close
**Ficheiro:** `src/components/ui/Drawer.tsx`
**Problema:** O drawer mobile (bottom-sheet) tem handle visual (`w-8 h-1 rounded-full bg-fg-subtle/30`) mas sem funcionalidade de drag. Em todas as apps modernas (Google Maps, Apple Maps, Surfline), o bottom-sheet suporta swipe-down para fechar.
**Melhoria:** Implementar touch drag via `onTouchStart`/`onTouchMove`/`onTouchEnd`.

### M6. SpotCard — não mostra sport score label quando sport é `null`
**Ficheiro:** `src/components/spots/SpotCard.tsx:139`
**Problema:** Quando `selectedSport` é `null`, o ScoreGauge mostra label "Spot" que não é informativo. Os cards no grid não mostram qual sport está a ser avaliado.
**Melhoria:** Mostrar o label do sport com melhor score, ou "Best" como label.

### M7. Spot detail back button — não preserva filtros
**Ficheiro:** `src/components/spots/SpotDetailClient.tsx`  
**Problema:** O botão "← Voltar" navega para `/${locale}/spots/` mas não preserva os filtros (sport/region) que o utilizador tinha na homepage. Depois de ver um spot, o utilizador perde o contexto de filtragem.
**Melhoria:** Usar `router.back()` ou passar query params.

### M8. Footer `FeedbackForm` — trigger button demasiado subtil
**Ficheiro:** `src/components/layout/Footer.tsx:68`
**Problema:** "Sugerir / Reportar" é um link de texto minúsculo perdido no footer. A funcionalidade de contribuição é importante para crescimento da plataforma.
**Melhoria:** Promover com ícone maior ou FAB (floating action button) acessível de qualquer página.

---

## 🟢 Melhoramentos de Polish (Média/baixa prioridade)

### P1. Not-found page só em Português
**Ficheiro:** `src/app/not-found.tsx`
**Problema:** Hard-coded em pt ("Spot não encontrado", "Ver todos os spots", "Voltar à homepage"). Utilizador em `/en/spots/xyz` vê conteúdo em PT.
**Fix:** Usar `cookies`/`headers` para detectar locale ou criar `[locale]/not-found.tsx`.

### P2. Dawn Patrol banner — loading skeleton dimensions
**Ficheiro:** `src/components/DawnPatrolBannerWrapper.tsx`
**Problema:** O skeleton mostra um layout com dimensões fixas (`w-12 h-12`, `w-32`, `w-64`, `w-48`). Se o banner real tiver conteúdo diferente, há layout shift (CLS).
**Melhoria:** Medir e alinhar skeleton com o layout real do banner.

### P3. Ticker `animationDuration: '60s'` — muito lento com poucos spots
**Ficheiro:** `src/app/[locale]/page.tsx:175`
**Problema:** Com top5 spots × 2 duplicados = 10 items, a animação de 60s é lenta. O conteúdo demora muito a fazer loop. Com mais spots seria melhor.
**Melhoria:** Calcular duração dinamicamente: `${tickerSpots.length * 6}s`.

### P4. `card-1` vs `card-2` — distinção visual subtil de mais
**Ficheiro:** `src/app/globals.css:198-206`
**Problema:** `card-1` = `bg-surface-1 border border-divider` vs `card-2` = `bg-surface-2 border border-divider-strong`. A diferença visual é quase imperceptível, especialmente em dark mode (4% vs 8% alpha white).
**Melhoria:** Adicionar `shadow-card` ao `card-2` por defeito para diferenciar melhor.

### P5. Geist Mono não tem fallback de peso em iOS Safari
**Ficheiro:** `tailwind.config.ts:135`
**Problema:** Font stack `['var(--font-geist-mono)', 'ui-monospace', ...]` — em iOS Safari < 17, se a variável CSS falhar, cai para `ui-monospace` que pode não suportar `font-weight: 600`. Os números do ScoreGauge podem aparecer regular em vez de semibold.
**Melhoria:** Adicionar `'SFMono-Regular'` antes de `'ui-monospace'` (já está, mas confirmar que `font-weight` é aplicado).

### P6. Map cluster markers — hidden divs
**Ficheiro:** `src/app/globals.css:381-394`
**Problema:** `.marker-cluster-small div`, `.marker-cluster-medium div`, `.marker-cluster-large div` todos com `display: none !important`. Isto esconde o counter nativo do MarkerCluster mas o `ventu-cluster-icon` custom usa `display: flex !important`. Se por algum motivo o custom icon falhar, o cluster fica vazio visualmente.
**Melhoria:** Adicionar fallback visual no CSS (color/background) para os clusters nativos.

### P7. Falta `rel="noopener noreferrer"` em links externos do Footer
**Ficheiro:** `src/components/layout/Footer.tsx:37-47`
**Status:** ✅ Já tem `rel="noopener noreferrer"` — sem problema.

### P8. Loading.tsx — skeleton genérico
**Ficheiro:** `src/app/loading.tsx`
**Problema:** O skeleton é genérico (header bar + 6 rectangles). Não corresponde ao layout real da homepage (hero + ticker + grid with ScoreGauges). Causa layout shift perceptível.
**Melhoria:** Criar skeleton que espelha o layout da homepage (hero block + filter bar + card grid).

---

## 📱 Mobile-Specific Issues

| # | Problema | Ficheiro | Impacto |
|---|---------|---------|---------|
| M-1 | Filter bar horizontal scroll — sem edge-fade visual | SpotGridClient.tsx:282 | Pills da direita cortadas sem indicação de scroll |
| M-2 | Drawer width=420px — pode exceder viewport em tablets estreitos | Drawer.tsx:107 | `maxWidth: '100vw'` protege, mas 420px pode ser tight |
| M-3 | Hero "Ver todos" button em full-width em mobile mas inline em desktop | page.tsx:240-241 | Inconsistência — botão deveria ser full-width em mobile |
| M-4 | ForecastTable scroll horizontal — sem indicação visual | ForecastTable.tsx | Tabela larga sem edge-fade ou scroll indicator |
| M-5 | SpotDrawerTabs — pills pequenas (text-xs py-1.5) para touch | SpotDrawer.tsx:100 | Abaixo de 44px touch target em mobile |
| M-6 | Search modal `pt-[20vh]` — em landscape mobile, 20vh = ~60px, modal muito no topo | HomepageSearch.tsx:102 | Em landscape, o modal fica colado ao topo |

---

## 🏗️ Recomendações de Estrutura Visual

1. **Grid sem SpotCards** — A homepage não usa `SpotCard` no grid. O `SpotGridClient` não renderiza cards — renderiza apenas o mapa + drawer. Os spots não aparecem em grid na homepage. Verificar se isso é intencional. Se for, a homepage só mostra mapa + drawer.

2. **Consistência de border-radius** — O design system define `rounded-card: 8px` e `rounded-modal: 12px`, mas o `HomepageSearch` usa `rounded-2xl` (16px), o `NewsCard` (via glass-card) usa `rounded-2xl`, e o search palette usa `rounded-2xl`. Padronizar.

3. **Dark/Light toggle UX** — O sistema de tema inverte a lógica: classe `theme-ocean` = light, ausência = dark. Isso é contra-intuitivo para outros developers. Documentar no design system.

4. **Sport pills color feedback** — No `SpotGridClient`, os sport filter pills no estado activo usam `bg-surface-2 text-fg` (neutro). Outros componentes como `SportTab` em `SpotDetailClient` usam cores do score. Inconsistência entre filtros de sport (homepage neutro vs detail colorido).

5. **Favicon SVG** — Sem ícones PNG para browsers antigos ou social media crawlers (LinkedIn, WhatsApp previews). Adicionar `favicon-32x32.png` e `favicon-16x16.png`.

---

## Próximos Passos Sugeridos (por impacto visual)

1. **[P1] Fix NewsCard glass-card → card-1** (5 min)
2. **[P4] Fix SpotGridClient sticky top-0 → top-16** (2 min)
3. **[P3] Esconder status bar em mobile** (3 min)
4. **[P5] Reduzir hero min-height em mobile** (2 min)
5. **[M1] Animar mobile menu** (30 min)
6. **[M2] Unificar search** (45 min)
7. **[M3] Link no hero score** (5 min)
8. **[M5] Drawer drag-to-close** (1h)
9. **[M-1] Edge-fade nos filter pills** (10 min)
10. **[M-4] Edge-fade no ForecastTable** (10 min)
