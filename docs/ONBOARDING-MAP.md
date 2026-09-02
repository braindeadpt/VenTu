# Onboarding & teaching surfaces (map)

## Wind-ring legend — behavior contract (since 3839d3ee7)

- **Never auto-opens.** The old `requestIdleCallback` auto-open of the
  aria-modal coach over the map was removed (it blocked every marker
  click 2–4s after load).
- **Modal** (`WindRingLegend`, aria-modal): opens ONLY via the explicit
  help button ("Como ler o vento no mapa") in `MapControls` (desktop)
  and `MapExploreHud` (fullscreen).
- **Inline hint** (role="note", non-modal, auto-hides after 12s): shows
  ONCE per browser, triggered by the user's first marker interaction
  (`onMarkerInteract` callback: `createSpotMarker` click handler →
  `useMapMarkers` → `SpotMapInteractive`). Persisted through the same
  `ventu:windRingLegendSeen` flag (`src/lib/windRingLegend.ts`).
- **i18n copy**: `map.windRingLegend.*` in `src/lib/translations/pt.ts`
  and `en.ts`.
- **Spec**: `tests/e2e/wind-ring-legend.spec.ts` (desktop viewport —
  `readWindPref()` forces wind rings off on mobile by design, so the
  coach scenario only exists where wind rings render).
- Helpers preseed the seen flag before `goto` (`tests/e2e/helpers/map-setup.ts`);
  note `addInitScript` re-runs on every reload, so a flag removed there
  is removed on EVERY navigation — never rely on it for persistence
  checks within one test.
