# VenTu — UX/UI Redesign Specification

## Audit Summary

### Critical Problems (Must Fix)

1. **Hero Section — Weak First Impression**
   - SVG wave animation looks cheap/cheap
   - Title "VenTu" alone doesn't explain value prop
   - Dynamic subtitle is clever but visually jumbled
   - CTA is a generic button, no urgency
   - No live data visible above the fold
   
2. **Information Overload — No Hierarchy**
   - 6 sections with equal visual weight
   - User doesn't know where to look first
   - "Map" section is just 81 buttons in a grid (visual vomit)
   - "Conditions" section shows ONE spot's data as "general conditions" (misleading)
   
3. **Top 3 Cards — Cluttered**
   - Each card has: rank, name, region, score, stars, recommendation, sport badges, wave height, wind, crowd — TOO MUCH
   - Star ratings (1-5) conflict with score (0-100) — confusing
   - Sport compatibility badges add noise when user hasn't selected a sport
   - "Bot" label on subtitle feels like an apology, not a feature
   
4. **"Map" Section — Misleading Name**
   - Called "Mapa dos Spots" but is a grid of text buttons
   - 81 items in a 6-column grid = cognitive overload
   - No geographic context whatsoever
   
5. **Conditions Section — Wrong Data**
   - Shows "best spot" conditions as "general conditions" 
   - Dawn Patrol time calculated from month (not actual sunrise API)
   - 4 stat boxes with equal weight — which matters most?
   
6. **Stats Footer — Invisible**
   - Generic "81 spots / 61 waves / 6 sports" 
   - No visual impact, just numbers
   - "Made by Locals" with heart icon = generic

### Medium Problems

7. **SportSelector** — Works but disconnected from results
8. **SpotGrid** — 6 spots shown, but user wants to see more/fewer
9. **No scroll indicator** — user doesn't know there's more below
10. **No loading skeleton** — data flickers in

---

## Redesign Strategy

### Guiding Principles
1. **One thing at a time** — Each section has ONE job
2. **Live data first** — Weather/conditions are the hero, not the brand
3. **Progressive disclosure** — Start simple, let user dig deeper
4. **Visual breathing room** — Space between elements > dense packing
5. **Motion with purpose** — Animations guide attention, not distract

### Visual Hierarchy (What Gets Attention)

```
1. LIVE CONDITIONS TICKER (top bar, always visible)
   → "Guincho: 2.1m | 18kt | 16°C | Score: 85"
   
2. HERO — Featured Spot of the Day
   → Cinematic background + Big score + CTA to spot
   → ONE spot, not three. The best one. Make it epic.
   
3. QUICK FILTERS (sticky on scroll)
   → Sport + Region + Difficulty
   → Horizontal bar, minimal, fast
   
4. SPOTS GRID
   → Clean cards: Name | Region | Score | Conditions | Sport
   → 12 cards visible, "Load more" or pagination
   
5. MINI MAP
   → Real OpenStreetMap embed (iframe)
   → Shows spots as dots (colored by score)
   → "Explore on map" link to full map page
   
6. FOOTER STATS
   → Big numbers with context
   → "81 spots monitored in real-time"
```

---

## Section-by-Section Specs

### 1. LIVE CONDITIONS TICKER

```
Position: Fixed top, below header
Height: 48px
Background: glassmorphism (backdrop-blur), border-bottom
Content: Scrolling/marquee of top 5 spots with live data
Animation: Smooth horizontal scroll, pauses on hover

Layout:
[🌊 Guincho: 2.1m | 18kt | 85/100] [🌊 Nazaré: 3.2m | 12kt | 78/100] ...
```

### 2. HERO — Featured Spot of the Day

```
Height: 70vh (cinematic)
Background: 
  - Gradient from dark to spot image (if available)
  - Animated gradient overlay (subtle, ocean colors)
  - Or: Full-bleed hero image with dark overlay

Layout (centered, stacked):
[Score Badge — 85/100, pulsing glow]
[Spot Name — "Guincho" — 5xl font, bold]
[Tagline — "Ondas perfeitas + vento offshore" — 2xl, muted]
[3 key stats in a row — Wave | Wind | Water Temp]
[CTA Button — "Ver Condições ao Vivo" — large, primary]
[Secondary link — "Explorar todos os spots →"]

Visual effects:
- Score badge: glow effect (box-shadow with color matching score)
- Background: subtle animated gradient or parallax
- Text: slight text-shadow for depth
```

### 3. QUICK FILTERS BAR

```
Position: Sticky below hero (stays at top on scroll)
Height: 64px
Background: solid dark with subtle border

Layout (horizontal, centered):
[🌊 Surf] [💨 Kitesurf] [🏄 Windsurf] [All] | [Norte] [Centro] [Sul] [Açores] | [Iniciante] [Intermédio] [Avançado]

Active state: pill shape, colored background
Inactive: ghost button

Behavior: Click → instant filter, spots grid updates with smooth animation
```

### 4. SPOTS GRID

```
Layout: 3-column on desktop, 2 on tablet, 1 on mobile
Gap: 24px

Card design (minimal):
┌─────────────────────────────┐
│  [IMAGE or Gradient BG]     │  ← 40% of card height
│  ┌───────────────────────┐ │
│  │ Name          Score   │ │  ← Bold name, colored score
│  │ Region | Difficulty   │ │  ← Small, muted
│  │                       │ │
│  │ 🌊 2.1m  💨 18kt  🌡️ 16°C │ │  ← 3 mini stats
│  │                       │ │
│  │ [Surf] [Kitesurf]     │ │  ← Sport tags (if space)
│  └───────────────────────┘ │
└─────────────────────────────┘

Hover: Lift (translateY -4px), shadow increase, image zoom
Click: Navigate to spot detail

Pagination: "Mostrar mais 12 spots" button at bottom
```

### 5. MINI MAP

```
Height: 400px
Background: OpenStreetMap iframe
Border-radius: 16px
Overflow: hidden

Overlay (bottom-left):
  "81 spots em Portugal"
  [Ver Mapa Completo →]

No interaction in the iframe (just visual context)
Click "Ver Mapa Completo" → goes to /map page
```

### 6. FOOTER STATS

```
Layout: 4 columns, big numbers
Background: slightly different shade for separation

[81] spots monitorizados
[6] desportos suportados
[Realtime] dados Open-Meteo
[100%] grátis para sempre

Below: Links, GitHub, About
```

---

## Design System Updates

### Colors
```
Primary: Ocean gradient (cyan → blue → deep blue)
Accent: Dynamic based on score
  - 80-100: Emerald glow
  - 60-79: Cyan glow  
  - 40-59: Amber glow
  - 0-39: Rose glow
Background: Deep navy (#0a0e27) with subtle texture
Surface: Glassmorphism (bg-white/5 + backdrop-blur + border-white/10)
Text: White/90 (primary), white/60 (secondary), white/40 (tertiary)
```

### Typography Scale
```
Display: 5xl (hero name)
Headline: 3xl (section titles)
Title: xl (card names)
Body: base (descriptions)
Caption: sm (stats, labels)
Tiny: xs (tags, badges)
```

### Spacing
```
Sections: py-20 (80px) between major sections
Cards: p-6 (24px) internal padding
Grid gap: gap-6 (24px)
Elements within card: space-y-3 (12px)
```

### Effects
```
Glass card: bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl
Glow (score): box-shadow: 0 0 40px rgba(color, 0.3)
Hover lift: transform: translateY(-4px); transition 0.3s
Button glow: shadow-lg shadow-primary/25
```

---

## Animation Plan

| Element | Animation | Trigger |
|---------|-----------|---------|
| Hero score badge | Pulse glow | On load, then every 30s |
| Hero background | Slow parallax | Scroll |
| Ticker | Smooth scroll | Always |
| Filter bar | Slide down | After hero scrolls out |
| Cards | Fade up + stagger | On scroll into view |
| Card hover | Lift + shadow | Hover |
| Score numbers | Count up | On view |
| Map | Fade in | On scroll into view |

---

## Responsive Breakpoints

```
Mobile (<640px): 1 column, stacked filters, hero 50vh
Tablet (640-1024px): 2 columns, horizontal filters
Desktop (>1024px): 3 columns, full experience
```

---

## Implementation Order

1. **Phase 1**: Hero redesign + Ticker (biggest impact)
2. **Phase 2**: Quick filters + Spots grid (core functionality)
3. **Phase 3**: Mini map + Footer (finishing touches)
4. **Phase 4**: Animations + Polish (wow factor)

---

## Success Metrics

- Time to first meaningful content: <2s
- Visual hierarchy: User knows where to click in <3s
- Information density: No more than 3 pieces of info per card
- "Wow" factor: Someone should screenshot it
