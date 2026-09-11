<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VenTu agent contract

## What VenTu is (non-negotiable)

| Layer | Constraint |
|---|---|
| App | Next.js, `src/app/[locale]`, PT-PT first, EN second |
| Data | `scripts/` + `public/data/` + Actions (~3h); Open-Meteo, IH, IPMA, Ecowitt |
| Product | scores in `src/lib`, spots in `src/lib/spots.ts`, livecams in `src/lib/spotLivecams.ts` |
| Account | Supabase (favorites, alerts, feedback), magic link, RLS |
| Quality | Vitest + Playwright, hermetic `build:e2e` |
| Deploy | static export on GitHub Pages — no server runtime |
| Extra | `worker/`, `terraform/`, OG images, sitemap |

An agent that ignores this invents API routes Pages can't run, livecam embeds
that are banned, or changes the score formula without tests. Don't.

## Skills

Skills live in `.agents/skills/` (Agent Skills standard). Same files for Claude, Cursor, Devin, Grok, Copilot.
Tool-specific dirs (`.claude/skills`, `.cursor/skills`, `.devin/skills`, `.grok/skills`, `.github/skills`) are local junctions to `.agents/skills` — recreate on a fresh clone with `New-Item -ItemType Junction -Path <dir> -Target .agents\skills` (Windows) or `ln -sfn ../.agents/skills <dir>`.

House skills (load the one matching your surface):
- `ventu-premium-frontend` — UI/CSS/Tailwind/components/map/copy. Overrides third-party aesthetic defaults.
- `ventu-data-pipeline` — `scripts/`, `public/data/`, scores, buoys, news, Dawn Patrol.
- `ventu-static-export` — routes, auth, alerts, forms, anything server-shaped.
- `ventu-i18n-voice` — any user-facing string or translation.
- `ventu-verify` (+ `ventu-verify-ui` for frontend) — before any PR.

Generic skills (taste & engineering, never override the house rules):
`frontend-design`, `web-design-guidelines`, `apple-design`, `animate`,
`vercel-react-best-practices`, `vercel-composition-patterns`,
`vercel-react-view-transitions`, `frontend-ui-engineering`.

Mention skills as `@skills:ventu-premium-frontend` when the tool supports it.

## Canonical docs — read these, skills point at them

- `docs/CONTEXT.md` — architecture and CI
- `docs/DESIGN-SYSTEM.md` — tokens, components, voice
- `docs/ALERTS.md`, `docs/AUTH.md` — how account features work without a server
- `.cursor/rules/` — existing rules; skills must not contradict them
- `CONTRIBUTING.md`

