# VenTu — documentation index

| Document | Purpose |
|----------|---------|
| [CONTEXT.md](CONTEXT.md) | Architecture, CI workflows, conventions |
| [ROADMAP.md](ROADMAP.md) | Phases, priorities, session notes |
| [BACKLOG.md](BACKLOG.md) | Deferred ideas and tech debt |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Tokens, components, patterns |
| [NEWS-SYSTEM.md](NEWS-SYSTEM.md) | RSS + Gemini news pipeline |
| [ALERTS.md](ALERTS.md) | Email alerts setup (E1) |
| [DIRECTORY.md](DIRECTORY.md) | Schools/shops directory + claim (B2B) |
| [GITHUB-SETUP.md](GITHUB-SETUP.md) | Secrets and Actions setup |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute (repo root) |

## Archive (historical)

Planning notes and audits kept for reference — **not** current source of truth:

| Document | Notes |
|----------|-------|
| [archive/FIXES.md](archive/FIXES.md) | Wave 1–3 fix log (2026) |
| [archive/PLANO-DIFERENCIACAO.md](archive/PLANO-DIFERENCIACAO.md) | Early differentiation plan |
| [archive/SOCIAL-REPORT.md](archive/SOCIAL-REPORT.md) | Social network feasibility study |
| [archive/CHAT-SECURITY.md](archive/CHAT-SECURITY.md) | Chat feature (removed) |
| `UX-AUDIT.md`, `VISUAL-AUDIT.md`, `REDESIGN-SPEC.md`, … | Design audits |

Prefer **ROADMAP** and **CONTEXT** for current state.

## SEO & social

- Open Graph image: `public/og-image.png` (regenerate with `npm run og:generate`)
- Metadata helper: `src/lib/seo.ts`
- Sitemap: `npm run sitemap:generate` → `public/sitemap.xml`
