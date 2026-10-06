# Map overlay architecture — pane order & field-layer contract

The fullscreen map (`/mapa`) stacks layers in dedicated Leaflet panes. Every
field overlay follows the same contract so new layers register without
rewriting the map core.

## Pane hierarchy (bottom → top)

| z-index | Pane | Layer | Notes |
|---|---|---|---|
| — | `tilePane` | basemap (CARTO light/dark **no-labels**, Esri satellite) | Leaflet default — labels moved to `ventu-labels` so data overlays never cover toponymy |
| 201 | `ventu-hillshade` | **Esri World_Hillshade** | terrain relief under the basemap; `mix-blend-mode: multiply` **on the pane** (blends against the tile pane below — inside the pane it composes against nothing); opacity per theme in `globals.css` |
| 206 | `ventu-goes-ir` | **GOES-East ABI Band 13 Clean IR** (NASA GIBS WMTS) | animated carousel — 12 frames × 10 min ending ~45 min back; stretched above `maxNativeZoom: 6`; keyless; `gibs.earthdata.nasa.gov` in CSP img-src; counts toward the heavy-raster cap |
| 210 | `ventu-bathymetry` | **EMODnet bathymetry WMS** (`emodnet:mean_multicolour` + `emodnet:contours`) | part of «Carta náutica» — depth shading + 50–5000 m contours (island coverage — IH isobaths are mainland-only); host in CSP img-src (meta + terraform) |
| 340 | — | isobaths (canvas image) | part of «Carta náutica» — static, below fields |
| 345 | `windfield` | **wind particle field** | ambient, animated |
| 348 | `sst` | SST ribbon | mutually exclusive w/ Hs |
| 350 | `hs` | Hs swell field + crest isolines | mutually exclusive w/ SST |
| 355 | — | tide ribbons | |
| 360 | `currents` | current ticks | vector marks, not flow |
| 370 | `ventu-seamarks` | **OpenSeaMap seamark tiles** | part of «Carta náutica» — buoys/beacons/harbours above the fields, below markers |
| 400 | `overlayPane` | radar IPMA frames | Leaflet default |
| 450 | `ventu-labels` | **toponymy/boundaries** (Esri Gray Reference or Boundaries_and_Places) | above every data overlay, below markers — labels stay legible over radar/satellite |
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

`MAP_HEAVY_RASTER_KEYS` (`src/lib/mapLayerBus.ts`) = `radar`, `nauticalChart`,
`goesIr` — max **2 active** (`MAP_HEAVY_RASTER_MAX`); turning on a third
evicts the oldest (toast names the evicted layer). The merged «Carta
náutica» counts as ONE layer even though it paints three sub-layers
(bathymetry WMS + isobaths + seamark tiles). The vector canvas fields
(Hs/SST/wind/currents) have their own mutual-exclusion rules and don't
count.

## Carta náutica (merged nautical layers)

One user-facing toggle — `data-map-nautical-chart-toggle`, persisted to
`ventu.map.nauticalChart`, shared as `?nauticalChart=1` — drives three
sub-layers together: IH isobaths (canvas, 8/16/30 m), EMODnet bathymetry
WMS and OpenSeaMap seamark tiles. In hero embeds only the isobaths paint
(bathymetry/seamarks are fullscreen-only). `readNauticalChartPref()`
migrates the legacy `ventu.map.isobaths`/`.bathymetry`/`.seamarks` keys,
and the three legacy share params (`?isobaths=1` etc.) still enable it.

## Satélite — MTG-I1 primário, GOES-East fallback (`mtgSat.ts` + `goesIr.ts`)

- **Primary source**: `scripts/fetch-mtg-ir.py` (hourly, inside
  `update-data.yml`) pulls FCI Level-1c via EUMETSAT Data Tailor —
  server-side subset to the `ventu_iberia_atlantic` ROI (28–52°N,
  34°W–1°E), resampled to ~2 km/px (0.02°). Two products per slot,
  chosen by solar elevation over the ROI centre (> ~15° = day —
  below that the natural-color photo is too dark to read). Minority
  unification: if fewer than 3 slots of one product would land inside
  a loop of the other, they are rendered as the dominant product — a
  lone daylight photo inside a night-IR sweep reads as a flash.
  - **`vis` (day)** — predefined `natural_color` filter → PNG RGB →
    opaque photo re-encoded to WebP.
  - **`ir` (night)** — `ir_105_effective_radiance` GeoTIFF → Planck
    brightness temperature → translucent cloud-top palette (warm surface
    ~12% alpha so the basemap reads through) → WebP.
  Output: `public/data/sat-mtg/frames/{vis,ir}-*.webp` +
  `sat-mtg.json` manifest (`{bounds, frames[{frameTime,imagePath,kind}]}`).
  Meteosat at 0° sees PT at near-native ~2 km — vs the GOES-East limb.
- **Frontend**: `useMapLayers` fetches the manifest when the toggle goes
  on; fresh manifest (< `MTG_SAT_STALE_MAX_AGE_MIN` = 3 h) → pool of
  `L.imageOverlay` (one per frame, opacity swap with a 320 ms fade) on the
  same `ventu-goes-ir` pane (z 206). Overlays are geo-anchored — the pool
  is never discarded on pan/zoom (that discard exists only for the GIBS
  tile fallback) and remaining frames are warmed idle right after init, so
  the sweep never holds a stale frame while a cold one fetches; dead/absent
  manifest → **GIBS fallback**
  (`goesIrFrames()` tiles, same carousel, `gibsTileMaskBlank` still masks
  off-disc black tiles). `goesIrSource` ('mtg'|'gibs') switches the
  carousel attribution (EUMETSAT vs NASA GIBS).
- Toggle «Satélite», `data-map-goes-ir-toggle`, persisted to
  `ventu.map.goesIr`, shared as `?goesIr=1` — unchanged contracts.
- Licence note: frames served are typically ≥1 h old = EUMETSAT «Core»
  (CC-BY-4.0); sub-hour FCI is «Recommended» (free only for
  research/education/personal). See docs/EXTERNAL-DATA.md.
- `gibsSatellite.ts` now only exports `gibsTileMaskBlank`. The MODIS
  true-color layer was removed (Fase 3).
