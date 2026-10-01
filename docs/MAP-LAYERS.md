# Map overlay architecture — pane order & field-layer contract

The fullscreen map (`/mapa`) stacks layers in dedicated Leaflet panes. Every
field overlay follows the same contract so new layers register without
rewriting the map core.

## Pane hierarchy (bottom → top)

| z-index | Pane | Layer | Notes |
|---|---|---|---|
| — | `tilePane` | basemap (CARTO light/dark, Esri satellite) | Leaflet default |
| 205 | `ventu-gibs-sat` | **NASA GIBS true-color** (MODIS Terra, «hoje») | opaque raster — real imagery from the latest satellite pass (clouds/fronts); `default` TIME slot always serves the newest date (`no-store`); `maxNativeZoom: 9`, stretched above; keyless; `gibs.earthdata.nasa.gov` in CSP img-src (meta + terraform); counts toward the heavy-raster cap |
| 206 | `ventu-meteosat-ir` / `ventu-goes-ir` | **Satélite IR** (15-min carousel) | translucent raster (opacity 0.85) — cold cloud tops; primary engine **EUMETView WMS Meteosat-11 IR10.8** (`msg_fes:ir108`, keyless, CORS `*`, PT centred in the 0° disk — see `docs/audits/SATELLITE-IR-OPTIONS.md`) with per-frame fallback to **GOES-East GIBS** after 3 tileerrors or 12 s without a successful tile; frames tinted with the Infra+ cold-top palette (`irPalette.ts`) after the mask; counts toward the heavy-raster cap |
| 210 | `ventu-bathymetry` | **EMODnet bathymetry WMS** (`emodnet:mean_multicolour` + `emodnet:contours`) | opt-in depth shading + 50–5000 m contours (island coverage — IH isobaths are mainland-only); host in CSP img-src (meta + terraform) |
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

## Heavy raster cap

`MAP_HEAVY_RASTER_KEYS` (`src/lib/mapLayerBus.ts`) = `radar`, `bathymetry`,
`seamarks`, `gibsSat`, `goesIr` — max **2 active** (`MAP_HEAVY_RASTER_MAX`);
turning on a third evicts the oldest (toast names the evicted layer).
GIBS true-color is opaque — it replaces the basemap visually, so it competes
with the other raster overlays for the same slot. The vector canvas fields
(Hs/SST/wind/currents) have their own mutual-exclusion rules and don't count.

## NASA GIBS (`gibsSatellite.ts` + `useMapLayers`)

- `GIBS_SATELLITE_URL` — WMTS REST `…/MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`.
  The `default` TIME segment always resolves to the latest available date —
  no client-side date math; `Cache-Control: no-store` keeps «today» fresh.
- `L.tileLayer` on `ventu-gibs-sat` pane, `pointerEvents: none`,
  `maxNativeZoom: 9` (~250 m/px — clouds, not street detail),
  `updateWhenZooming: false` (stretches cached tiles during the gesture —
  fetching per intermediate zoom melted the main thread with canvas masks).
- Anti-flash tríade via `gibsAttachTileMask` (also used by GOES-IR): hide on
  `tileloadstart` → `gibsTileMaskBlank` on `tileload` (idempotent via
  `dataset.ventuMasked` — re-masking every mixed tile twice cost a full
  256² `getImageData` + `toDataURL` each) → reveal content, keep 100 %
  no-data hidden. Without the hide step, black no-data tiles painted one
  frame before being hidden — black flashing on every zoom-out.
- Toggle in the Camadas menu («Satélite NASA», `data-map-gibs-sat-toggle`),
  persisted to `ventu.map.gibsSat` localStorage, disabled in hero embeds.
- Attribution: «Imagery © NASA GIBS (EOSDIS/MODIS Terra)».

## Satellite IR — Meteosat-11 primary + GOES-East fallback (`meteosatIr.ts`, `goesIr.ts` + `useMapLayers`)

- **Primary engine: EUMETView WMS** (`meteosatIr.ts`) — Meteosat-11 SEVIRI
  IR10.8 (`msg_fes:ir108`), 15-min cadence, ~30 min lag, full 0° disk
  (±77°, `METEOSAT_IR_BOUNDS`). Portugal sits in the *centre* of the disk —
  unlike GOES-East, where it was smeared at the eastern limb (physics:
  sub-satellite ~75°W, GIBS has no Meteosat). Keyless, `ACAO: *`,
  measured 512² over PT in 0.4–0.6 s (2026-10-01,
  `docs/audits/SATELLITE-IR-OPTIONS.md`). CSP: `view.eumetsat.int` in
  img-src (meta + terraform).
- `L.tileLayer.wms` per frame with fixed `time=` on the shared IR pane
  (z 206); switching frames swaps opacity (0.85 active), warms frame+1,
  discards idle pool layers on `movestart` (active + warming survive).
- **Per-frame fallback to GOES-East GIBS** (`goesIr.ts`, 10-min slots):
  3+ `tileerror`s on a frame, or 12 s without any successful tile, evict
  the Meteosat layer for that frame and `activate` re-runs on GOES — the
  layer never dies when the state service is down. The carousel badge/
  cadence follow the primary product (15 min).
- **Infra+ cold-top palette** (`irPalette.ts` + `irPaletteTile.ts`):
  after the GIBS mask, pixels with brightness ≥ 150 (~240 K) are tinted
  blue→cyan→green→yellow→red by severity (Windy/EUMETSAT enhancement
  scheme, `cwg.eumetsat.int/color-enhancements`); ground/sea keep the
  grayscale. Runs once per tile (dataset guard, same as the mask).
- Attribution: «Meteosat-11 © EUMETSAT» linking to the EUMETView page.
- Toggle `data-map-goes-ir-toggle`, persisted to `ventu.goes-ir.state`,
  deep link `?goesIr=1`, included in the share-view URL (unchanged).
- Shared `RadarCarousel` with `SatelliteDish` icon, Lisbon-wall-clock badge
  (`goesIrFrameClock`), gap/stale labels (cadence 10, stale > 120 min),
  NASA attribution node. The fullscreen HUD only owns the *radar* scrubber
  — the IR carousel keeps its floating play + range in fullscreen too (offset
  +84 px when radar is also on), otherwise frames were unreachable there.
- Toggle in the Camadas menu («Satélite IR (10 min)»,
  `data-map-goes-ir-toggle`), persisted to `ventu.goes-ir.state`
  localStorage, deep link `?goesIr=1`, included in the share-view URL.
