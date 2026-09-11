---
name: ventu-verify
description: Pre-PR verification for VenTu — tests, data validation, static build, and e2e for the touched surface. Use before opening any PR. For visual UI checks also load ventu-verify-ui.
---

# VenTu Verify (pre-PR)

Run what matches the surface you touched:

- `npm test` — always (Vitest).
- `npm run spots:validate` — if you touched spots/scores.
- `npm run data:validate` — if you touched generated `public/data` shapes.
- `npm run build` — if you touched routes, i18n, or anything in the export.
- `npm run test:e2e` (or the spec for the surface you touched) — e2e builds are
  hermetic (`build:e2e`); do not leave a failing spec "for CI to decide".

For frontend changes, also load `ventu-verify-ui`: check `/pt` and `/en`, the
fullscreen map, one spot with livecam and one without, at 390px and 1440px —
no console errors, no overflow, no raw i18n keys.
