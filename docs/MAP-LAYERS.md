# Map overlay architecture — pane order & field-layer contract

The fullscreen map (`/mapa`) stacks layers in dedicated Leaflet panes. Every
field overlay follows the same contract so new layers register without
rewriting the map core.

## Pane hierarchy (bottom → top)

| z-index | Pane | Layer | Notes |
|---|---|---|---|
| — | `tilePane` | basemap (CARTO light/dark, Esri satellite) | Leaflet default |
| 210 | `ventu-bathymetry` | **EMODnet bathymetry WMS** (`emodnet:mean_multicolour`) | opt-in depth shading; host in CSP img-src (meta + terraform) |
| 340 | — | isobaths (canvas image) | static, below fields |
| 345 | `windfield` | **wind particle field** | ambient, animated |
| 348 | `sst` | SST ribbon | mutually exclusive w/ Hs |
| 350 | `hs` | Hs swell field + crest isolines | mutually exclusive w/ SST |
| 355 | — | tide ribbons | |
| 360 | `currents` | current ticks | vector marks, not flow |
| 400 | `overlayPane` | radar IPMA frames | Leaflet default |
| 600+ | `markerPane` | spot pins, wind arcs, clusters | always on top |

## Field-layer contract (`useMap*Field`)

Each field = `src/lib/map*Field.ts` (pure: samples → IDW grid → draw) +
`useMap*Field.ts` (leaflet lifecycle). Shared conventions:

- `MAP_*_PANE` + `MAP_*_PANE_Z` constants in the lib file.
- Pane: `pointer-events: none`, `leaflet-zoom-hide`, `aria-hidden` canvas.
- Data: `public/data/map-hours.json` series per spot/hour, read via
  `*AtHour()` getters in `src/lib/mapHours.ts`. `fetchMapHours()` has
  module-level cache + inflight dedup — hooks may fetch it themselves when
  the «48h» timeline layer is off.
- Sampling: ocean spots only (`isOceanFieldSpot`); IDW over
  `MAP_HS_BOUNDS` (mainland/Azores/Madeira); `landAwareFalloff` kills the
  field inland. Directional fields interpolate `u/v` components, never raw
  angles. Each field owns its water mask (`currentTickOnWater`,
  `windCellOnWater`) — tune per layer.
- **Land mask** (`src/lib/landMask.ts`): GADM 4.1 level-0 coastlines for
  PT+ES baked to `landRings.ts` (`scripts/bake-land-rings.mjs` regenerates)
  and scanline-rasterized at ~600 m → `pointOnLand(lat,lon)` is O(1) and
  gates every field (mainland, Azores and Madeira alike). Replaces the old
  per-coast heuristics that left island interiors painted.
- **View-locked raster** (Hs/SST tiles): the image overlay renders only the
  padded view bounds at ~260 cells across, so the band stays smooth at any
  zoom (fixed-resolution tiles went blocky when zoomed). Painted width is
  also capped in screen space (`maxDist` shrinks toward ~20 km when the
  view is small) — the real ~38 km band would flood a close-up. Edges
  feather into the pad so panning never reveals a tile cut.
- Zoom: hide during `_animatingZoom`, repaint on `zoomend` (nested rAF),
  repaint on `moveend`/`viewreset`.
- Mobile: smaller budget/step (`isMobile` prop), lower opacity.
- `prefers-reduced-motion`: static/frozen render, no rAF loop.
- Lifecycle: cancel all RAFs + listeners in effect cleanup; canvas removed
  when the layer disables.
- Testability: `data-map-*` attributes on `.leaflet-container`
  (`data-map-windfield="true"`), canvas has a stable class
  (`ventu-windfield-canvas`).

## Wind field specifics (`mapWindField` + `useMapWindField`)

- `wind` block in map-hours: `{ spd: m/s, dir: FROM° }` per spot/hour —
  same shape as `currents`. Serialized by `build-map-hours.js` from
  `windSpeed`/`windDirection` in forecast rows (no new API).
- Particles advect in **screen-px-normalized** space
  (`MAP_WIND_PX_PER_S_PER_MS` × `metersPerPixel`) so trail length is
  zoom-independent; speed/length/thickness ∝ kt; density ∝ kt·falloff via
  rejection spawn.
- Trail persistence via `destination-in` fade (`MAP_WIND_FADE`).
- Close-zoom detail stays on the **pin wind arcs** (`mapWindArrow`) — the
  field is ambient context, the arc is exact reading.
- Colour: `--data-wind` token (violet-700 light / violet-400 dark) — works
  on light/dark/satellite without per-basemap branching.

## Future layers — where they land

| Layer | Kind | Pane | Notes |
|---|---|---|---|
| `nav_warning_local` (149) | point/polygon markers | `markerPane` | via warnings pipeline → chips/halos on spots, never raw map spam |
| `orca_anavnet_point` (27, ≤25 km/180 d) | marker + warning channel | `markerPane` | enters via existing warning ingestion (`ANAV` ref) |
| Datawell EDR buoys | markers + cards | `markerPane` | reuse `map-buoys` layer; `fetchWaveSeries`/`DEFAULT_WAVE_API` swap when IH EDR ships |
| `notice_mariners` | — | — | skipped: regional polygons too vague (spot spam) |
| `hycom` EDR | validation only | — | redundant with Open-Meteo SST/currents; revisit for QA |
| `hfr_*`, `webgeo4` WFS | — | — | skipped: no JSON items / duplicates OGC buoy list |
| OpenSeaMap seamarks | raster tiles | own pane (below markers) | `tiles.openseamap.org/seamark` — CSP img-src + attribution when added |
| RainViewer | raster fallback | `overlayPane` | IPMA radar fallback — pipeline `radar.json` would carry source |

Rule of thumb: **ambient fields** live in numbered canvas panes (345–360,
under markers); **discrete entities** (warnings, orcas, buoys) stay in the
marker/overlay stack and surface through the existing warning/chip channels.
