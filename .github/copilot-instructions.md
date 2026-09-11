# Copilot — VenTu

Read `AGENTS.md` at the repo root first — it defines the project contract
(static export, PT-PT first, data pipeline, quality gates) and the skills to
load per surface from `.agents/skills/` (also mirrored at `.github/skills/`).

Short version: Next.js static export on GitHub Pages (no API routes/server
runtime), PT-PT copy first, scores/spots in `src/lib`, generated data in
`public/data` comes from GitHub Actions — never fetch provider APIs from the
browser. UI work follows `docs/DESIGN-SYSTEM.md` and the
`ventu-premium-frontend` skill; verify with `npm test` / `npm run build` /
`npm run test:e2e` before PRs.
