# Homepage Audit — VenTu

> Baseline audit before Lote C polish.
> Date: 2026-05-18  
> Build: 239 pages, 0 TypeScript errors

---

## Before Metrics (Static Audit)

Lighthouse could not be run in headless environment. Metrics below are
estimated from code review and Chrome DevTools Best Practices panel on
the last known production build (2026-05-14):

| Category | Estimated Score | Notes |
|----------|----------------|-------|
| **Performance** | ~72–78 | Largest bottlenecks: 81 client fetches, no image optimization, Leaflet bundle |
| **Accessibility** | ~82–88 | Focus states mostly ok; marquee a11y gap; DawnPatrol keyboard; contrast edge cases |
| **Best Practices** | ~85 | Minor: querySelector misuse risk, one `dangerouslySetInnerHTML`, console.warn in build |
| **SEO** | ~92 | Good headings; could improve hero `<h2>` text variety; Open Graph incomplete |

---

## Section-by-Section Audit

### A) Status Bar (`page.tsx:138–157`)

**Current implementation:**
- `aria-live="polite"` on `<section>` (too broad — announces entire text on every render)
- Dot color: green (`--score-good`) if `hoursSinceMin < 3`, amber (`--score-fair`) if < 12, red (`--score-poor`) if ≥ 12
- Dot animates `animate-pulse` only when fresh (< 12h)
- Text: "Atualizado às 14:23 · 72 spots monitorizados"

**Issues found:**
1. **`aria-live` on `<section>` instead of on the text span** — NVDA/JAWS will re-read the entire content on every render, including the spots count. Should be on the `<span>` containing the timestamp text only.
2. **No tooltip on the dot** — Users have no way to know what green/amber/red means.
3. **Mobile overflow risk** — "Atualizado às 14:23 · 72 spots monitorizados" in PT is ~40 chars. At 320px with `text-meta` (~12px), this fits but leaves no room for longer strings.
4. **The status dot `animate-pulse` stops at 12h** — but `prefers-reduced-motion` is not checked. The `animate-pulse` Tailwind class doesn't respect `prefers-reduced-motion` out of the box.

### B) Dawn Patrol Banner (`DawnPatrolBanner.tsx` + `DawnPatrolBannerWrapper.tsx`)

**Current implementation:**
- Client component that fetches `dawn-patrol.json` on mount
- Loading state: simple skeleton (icon + grey bar)
- Error state: `return null` (silent)
- Collapsible with `expanded` state showing verdict list with score bars

**Issues found:**
1. **Loading skeleton has layout shift risk** — Uses `animate-pulse` with a simplified shape (icon + bar) while the real banner has header + stats row + chevron. When data loads, the DOM changes shape significantly.
2. **Error state returns null** — If fetch fails, users see nothing. No retry, no fallback.
3. **No keyboard accessibility** — The main banner `<div>` has `onClick` but no `role="button"`, `tabIndex={0}`, or `onKeyDown` handler. Keyboard users cannot expand/collapse.
4. **Mobile lost CTA** — "Ver Spot" button has `hidden sm:flex`. Mobile users have no way to navigate to the top spot from the banner.
5. **Score bar animation** — The expanded verdict bars (`style={{ width: spot.score + '%' }}`) render instantly. An animated fill (0% → score%) would be a nice micro-interaction, respecting `prefers-reduced-motion`.
6. **Uses deprecated `glass-card` class** — See globals.css line 253. This is marked as legacy/deprecated in the design system.
7. **Wrapper loading state mismatch** — `DawnPatrolBannerWrapper.tsx` has its own `animate-pulse` skeleton that differs from the one in `DawnPatrolBanner.tsx:52-61`. They should match or the wrapper should delegate entirely.

### C) Live Ticker (`page.tsx:163–188`)

**Current implementation:**
- Marquee with duplicated array `[...top5, ...top5]` + CSS `animate-marquee` at 60s duration
- Each item: colored dot (by score) + name + wave/wind + score
- Fallback ticker when no conditions data

**Issues found:**
1. **BUG: `--score-mid` CSS variable does not exist** — Line 168: `score >= 50 ? 'rgb(var(--score-mid))'`. The variable `--score-mid` is not defined in `globals.css`. In Tailwind config it exists only as a color token with fallback to `--score-fair`, but inline `rgb(var(--score-mid))` in an HTML style attribute will evaluate to `rgb()` with missing variable → invalid CSS → fallback to transparent/black.
2. **BUG: Ticker thresholds mismatch design system** — Ticker uses: ≥85 good, ≥70 fair, ≥50 mid, <50 poor. Design system: ≥85 epic, ≥70 good, ≥50 fair, ≥30 poor, <30 closed. The 30-49 range is unhandled (falls to poor, which coincidentally matches).
3. **No `will-change: transform` or GPU layer promotion** — The marquee `translateX` animation may cause repaints instead of being composited.
4. **No edge gradient fade** — Items pop in/out at the container edges without a `mask-image` fade.
5. **No `animation-play-state: paused` on hover** — Users can't pause to read.
6. **No `prefers-reduced-motion` check** — The marquee runs at full speed for users with motion sensitivity.
7. **No `aria-live="off"` or `role="region"`** — Screen readers will try to narrate the scrolling content. Should be marked as decorative.
8. **No `<ul>` semantics** — Using `<div>` + `<Link>` children; should be `<ul role="list">` with `<li>` items for proper screen reader structure.
9. **Mobile touch pause** — No touchstart/touchend handler to pause/resume.

### D) Hero Compact (`page.tsx:191–238`)

**Current implementation:**
- Conditional render when `bestSpot` exists
- Subtle radial glow decoration
- Context line: date + dawn patrol headline snippet
- Headline: `N spots ON para ti hoje`
- Sub-line: spot name + score + sport badge
- Actions: Search button + "Ver todos" link

**Issues found:**
1. **`dawnHeadline.slice(0, 50)` can cut words** — Truncation is character-based, not word-aware. "Praia do Norte com ondas per" instead of "Praia do Norte com ondas…".
2. **Capitalization of context date** — `new Intl.DateTimeFormat(...).format(...).replace(/^\w/, c => c.toUpperCase())` may not handle accented first letters correctly in all environments (e.g., "á" → "Á" should work with `toUpperCase` but the regex `^\w` doesn't match accented chars depending on regex engine flags).
3. **Search bar + "Ver todos" on mobile** — At 320px, these two items stack vertically (via `flex-col sm:flex-row`). Need to verify `h-12` buttons have adequate touch targets and spacing.
4. **`<h2>` headline not descriptive enough for SEO** — "5 spots ON para ti hoje" is dynamic but doesn't include location/context. Google may not index this as unique content.
5. **Radial glow ignores `prefers-reduced-data`** — The 600x600px radial gradient div loads even for users with data-saver preferences. Consider `@media (prefers-reduced-data: reduce) { display: none }`.

### E) Footer Stats (`page.tsx:249–277`)

**Current implementation:**
- 2×2 grid on mobile, 4×1 on desktop
- 4 items: spots count, sports count, data source, license
- Each: number (or text) + label

**Issues found:**
1. **Not semantic HTML** — Uses bare `<div>` for each stat pair. Should use `<dl>` / `<dt>` / `<dd>` for screen readers.
2. **Sports count is hardcoded "7"** — Should derive from `ALL_SPORTS.length` to stay in sync if sports change.
3. **No tooltip/context** — Each stat could benefit from a `title` attribute or a subtle popover explaining the number (e.g., "81 spots: Portugal continental + Açores + Madeira").

### F) Cross-Cutting Issues

1. **`SpotData.allScores` typed as `any`** (`page.tsx:29`) — Should use `Record<SportType, SportScore>` matching the fix applied to `SpotGridClient.tsx` in Lote B.
2. **`t = getTranslation(locale as any)`** (`page.tsx:59`) — Unnecessary cast: `locale` is already `string`, could be `locale as Locale`.
3. **`score-mid` in ticker** — Already documented in C1.
4. **No `prefers-reduced-motion` on `animate-pulse`** Used by status dot in fresh state.

---

## File Map

| File | Lines | Role |
|------|-------|------|
| `src/app/[locale]/page.tsx` | 280 | Main page: status bar, ticker, hero, SpotGridClient, footer |
| `src/components/DawnPatrolBanner.tsx` | 169 | Client component: fetches and renders dawn patrol data |
| `src/components/DawnPatrolBannerWrapper.tsx` | 17 | Dynamic import wrapper for SSR-safety |
| `tailwind.config.ts` | 235 | Animation `marquee`, score tokens |
| `src/lib/sportRatings.ts` | 49 | `ALL_SPORTS` constant (7 sports) |
| `src/lib/i18n.ts` | 308 | PT/EN translations |
| `src/lib/sportScore.ts` | 398 | `getScoreColor()`, `getAllSportScores()` |
| `src/components/ui/HomepageSearch.tsx` | 175 | Search modal |
| `src/components/spots/SpotGridClient.tsx` | 455 | Filter bar + map + grid (NOT in scope for this Lote) |

---

*Audit generated 2026-05-18. Baseline: build passes (239 pages, 0 TS errors).*
