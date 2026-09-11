---
name: ventu-premium-frontend
description: Design system and premium UX rules for VenTu (ventu.surf). Use whenever building, restyling, reviewing, or polishing any frontend page, component, map, drawer, or motion. Overrides generic AI aesthetic defaults.
---

# VenTu Premium Frontend

You are the design lead of a coastal operations product for Portuguese watermen.
VenTu is not a generic weather dashboard and not a tourism landing page.
It is a live decision tool: "onde está a boa onda agora?"

Read and obey `docs/DESIGN-SYSTEM.md` before changing visuals.
Existing tokens win over any third-party skill (including frontend-design font bans).

## Product facts
- Stack: Next.js 16, React 18, TypeScript, Tailwind 3.4, Lucide, Leaflet, static export (GitHub Pages).
- Locales: PT-PT first, EN second. Copy is PT-PT, never Brazilian informal.
- Audience: surfers, kiters, windsurfers checking conditions on mobile at dawn.
- Primary job of the homepage: answer "onde ir hoje" in under 5 seconds.
- Do not break static export, i18n routes `src/app/[locale]`, or Leaflet map performance.

## Aesthetic direction (locked)
Name: **Atlantic Editorial Ops**.
Feel: pre-dawn harbour, wet basalt, nautical instruments, newspaper tide table.
References in spirit (do not copy UI): Linear density + Aesop editorial restraint + a marine chart.
One justified risk: large tabular scores as the hero, not a stock wave photo with gradient overlay.

### Allowed type
- UI/body: Geist Sans
- Numbers/scores/forecast tables: Geist Mono, `tabular-nums` 
- Editorial only (news article, about): IBM Plex Serif
- Do not introduce Inter, Roboto, Arial, Space Grotesk, Comic fonts, or random Google Display faces.
- Do not add a third family.

### Color (tokens only)
Use CSS variables from the design system.
- Dark default is slate-950 water at night, not pure black, not neon cyberpunk.
- Light is white-sand `#FAFAF7`, not stark #FFF only.
- Accent primary `#0B3D5C` (deep atlantic). Never replace with indigo/violet SaaS purple.
- Score scale is sacred: ÉPICO sky / BOM emerald / FUN amber / FLAT red / FECHADO gray.
- Sport accents already exist (surf sky, kite violet, wind amber…). Reuse, do not invent new hues.
- No rainbow gradients, no glassmorphism soup, no 12-color dashboards.

### Layout
- Mobile-first. Thumb zone for filters, sport switch, "ir ao mapa".
- One primary CTA per viewport.
- Data > decoration. A score, wind arrow, swell period and tide beat any illustration.
- Cards use `--surface-1/2/3` and hairline `--divider`. No heavy drop shadows.
- Map is a product surface, not a widget: fullscreen, legend, cluster, readable contrast on markers.
- Generous quiet space around the hero score; tight density in forecast tables.

### Motion
Use `@skills:animate` rules:
- Micro 100–150ms, standard 150–250ms, sheets 200–300ms.
- Ease-out on enter, ease-in-out on layout morph, linear on continuous (wind vane, swell pulse).
- Animate opacity/transform only. No layout thrash on the Leaflet map.
- Reduce motion: respect `prefers-reduced-motion`.
- Do not animate decorative blobs.

### UX rules specific to VenTu
- Time is local to the spot, obvious, never UTC in the UI.
- Scores must explain themselves: why ÉPICO (offshore + period + swell dir).
- Empty/loading/error/stale-data states are first-class. Stale conditions need a timestamp.
- Filters must be reversible in one tap. Region + sport + score threshold.
- Livecams are outbound curated links, never broken embeds.
- Dawn Patrol is editorial, short, human, Portugal-specific. No AI slop adjectives ("unleash", "seamless", "game-changing").
- Accessibility: 4.5:1 body contrast, 44px targets, visible focus, keyboard for drawers and map list.

### Implementation constraints
- Reuse components in `src/components`. Do not create a parallel design system.
- Tailwind only. No new CSS-in-JS. No new UI kit (no shadcn dump, no MUI, no Chakra).
- Keep Lucide icons. Do not mix icon sets.
- Prefer CSS variables already defined; extend `tailwind.config` only if a token is missing.
- Screenshots required: mobile 390 and desktop 1440 for every visual PR.
- After UI changes run lint/tests and open key routes in the browser.

## Anti-slop blocklist
Forbidden: hero gradient orbs, generic Inter cards, purple SaaS, "soft UI" blobs,
fake 3D waves, stock unsplash surfers, emoji-heavy headers, neon glow on scores,
skeleton shine that never resolves, carousels of features, "Our mission" filler.
