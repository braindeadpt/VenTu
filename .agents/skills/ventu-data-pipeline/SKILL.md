---
name: ventu-data-pipeline
description: Rules for the VenTu data layer — scripts/, public/data/, scores, buoys (IH/WMO), Open-Meteo, IPMA, Ecowitt, news, Dawn Patrol. Use whenever touching data scripts, generated JSON, scoring, staleness display, or any data source.
---

# VenTu Data Pipeline

The GitHub Actions pipeline (~3h cadence) is the source of truth. `scripts/` fetches
from Open-Meteo, IH, IPMA, Ecowitt and writes `public/data/*.json`. The app reads
those JSON files — it never calls provider APIs from the browser in production.

## Rules
- Do not invent data sources. If a provider is missing, extend `scripts/` + the
  Actions workflow — never add a client-side fetch to a new external API.
- After touching `src/lib/spots.ts` or anything spot-related, run
  `npm run spots:validate` (and `npm run data:validate` for generated data).
- Scores live in `src/lib` — changing the formula requires tests; the score
  thresholds are shared by map markers, badges, alerts and compare.
- Timestamps and stale-data states must be visible in the UI — never present old
  readings as fresh.
- Buoy readings: IH is primary, WMO/Copernicus is the keyless fallback. If IH
  fails, the WMO path must still work (see `src/lib/buoyLayerHealth.ts`).
- Livecams are curated outbound links in `src/lib/spotLivecams.ts`. Default is
  `external` (no iframes); `kind: 'youtube'` (nocookie) or `'surfline'` embeds
  are allowed only when the operator officially provides them.
- News and Dawn Patrol content come from the pipeline; do not fabricate items.

## Verify
- `npm run spots:validate` after spots changes; `npm run data:validate` after
  touching generated JSON shapes; `npm test` for scoring changes.
