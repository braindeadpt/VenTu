# VenTu — documentation index

**Start here:** [CONTEXT.md](CONTEXT.md) (architecture, CI, conventions) and
[ROADMAP.md](ROADMAP.md) (phases, priorities). Agent contract: [`AGENTS.md`](../AGENTS.md)
at the repo root.

## Current docs

| Document | Purpose |
|----------|---------|
| [CONTEXT.md](CONTEXT.md) | Architecture, CI workflows, conventions |
| [ROADMAP.md](ROADMAP.md) | Phases, priorities, session notes |
| [BACKLOG.md](BACKLOG.md) | Deferred ideas and tech debt |
| [POLISH-BACKLOG.md](POLISH-BACKLOG.md) | Deferred UI polish items |
| [ROADMAP-ISSUES.md](ROADMAP-ISSUES.md) | GitHub issue templates for roadmap work |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Tokens, components, patterns, voice |
| [AUTH.md](AUTH.md) | Supabase auth (magic link, RLS) |
| [ALERTS.md](ALERTS.md) | Email alerts pipeline |
| [NEWS-SYSTEM.md](NEWS-SYSTEM.md) | RSS + Gemini news pipeline |
| [ES_NAV_WARNINGS.md](ES_NAV_WARNINGS.md) | Spanish NAVTEX/NAVAREA text warnings research |
| [DIRECTORY.md](DIRECTORY.md) | Schools/shops directory + claim (B2B) |
| [EVENTS.md](EVENTS.md) | Curated community events |
| [ONBOARDING-MAP.md](ONBOARDING-MAP.md) | Map teaching surfaces (wind-ring legend contract) |
| [SECURITY-HEADERS.md](SECURITY-HEADERS.md) | Real HTTP headers via Cloudflare (S7) |
| [EXTERNAL-KEEPALIVE.md](EXTERNAL-KEEPALIVE.md) | Keep-alive for the Actions data pipeline |
| [GITHUB-SETUP.md](GITHUB-SETUP.md) | Branch protection, secrets, Actions setup |
| [IH_API_KEY.md](IH_API_KEY.md) | IH buoy API key setup |
| [METEOALARM_API_KEY.md](METEOALARM_API_KEY.md) | MeteoAlarm token setup |
| [ZENODO.md](ZENODO.md) | DOI/citation guide |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute (repo root) |

## Archive (historical)

Planning notes, phase reports and audits kept for reference — **not** the
current source of truth:

| Document | Notes |
|----------|-------|
| [archive/FIXES.md](archive/FIXES.md) | Wave 1–3 fix log (2026) |
| [archive/PLANO-DIFERENCIACAO.md](archive/PLANO-DIFERENCIACAO.md) | Early differentiation plan |
| [archive/SOCIAL-REPORT.md](archive/SOCIAL-REPORT.md) | Social network feasibility study |
| [archive/CHAT-SECURITY.md](archive/CHAT-SECURITY.md) | Chat feature (removed) |
| [archive/PLANO-FASES.md](archive/PLANO-FASES.md), [archive/PLANO-REORGANIZACAO.md](archive/PLANO-REORGANIZACAO.md) | Phase/reorg plans |
| [archive/FASE-7-2-NOTES.md](archive/FASE-7-2-NOTES.md) | Phase 7.2 session notes |
| [archive/REDESIGN-SPEC.md](archive/REDESIGN-SPEC.md), [archive/UX-AUDIT.md](archive/UX-AUDIT.md), [archive/VISUAL-AUDIT.md](archive/VISUAL-AUDIT.md), [archive/AUDIT-HOMEPAGE.md](archive/AUDIT-HOMEPAGE.md), [archive/AUDIT-MAPA-VISUAL-2026-09.md](archive/AUDIT-MAPA-VISUAL-2026-09.md) | Design/UX audits |
| [archive/NEWS-LOCAL-RESEARCH.md](archive/NEWS-LOCAL-RESEARCH.md) | Local news research notes |
| [archive/E2E-STUCK-RUNS-2026-09.md](archive/E2E-STUCK-RUNS-2026-09.md) | E2E runner incident notes |
| [archive/hud-density-mockup.html](archive/hud-density-mockup.html) | HUD density mockup (referenced from globals.css) |
| [archive/wind-ring-audit/](archive/wind-ring-audit/), [archive/wind-ring-legend-audit/](archive/wind-ring-legend-audit/) | Wind-ring audit artifacts |

Prefer **ROADMAP** and **CONTEXT** for current state.

## SEO & social

- Open Graph image: `public/og-image.png` (regenerate with `npm run og:generate`)
- Metadata helper: `src/lib/seo.ts`
- Sitemap: `npm run sitemap:generate` → `public/sitemap.xml`
