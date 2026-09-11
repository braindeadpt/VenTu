---
name: ventu-verify-ui
description: Before any PR that touches frontend, run the app and visually verify PT/EN pages on mobile and desktop. Use when finishing UI work or opening a frontend PR.
---

# Verify VenTu UI before PR

1. `npm install` if needed, then `npm run dev`.
2. Wait until the app is ready.
3. Identify changed routes from the diff.
4. Always also open:
   - `/pt` and `/en` homepage
   - map fullscreen
   - one spot page with livecam and one without
   - news / Dawn Patrol if touched
5. Browser check at 390px and 1440px, light and dark if both themes exist.
6. Confirm: no console errors, no layout overflow, tap targets, contrast, i18n strings not leaking raw keys.
7. Screenshot before/after and attach to the PR.
8. Do not open the PR if the map janks, scores wrap badly, or PT copy is BR-PT.
