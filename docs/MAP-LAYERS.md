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
| 342 | `swellfield` | **«Ondulação»** — Hs colour field + 0.5 m isolines + spot swell symbols (canvas) and slow swell crests (second canvas) | from `sea-grid.json`; mutually exclusive w/ Hs and SST; wind particles draw on top (as in the approved mockup) |
| 345 | `windfield` | **wind particle field** | ambient, animated; colour by knots |
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
- Source: `sea-grid.json` (model grid, see below) when it covers the active
  hour — the field then covers the whole sea box and does not depend on
  which spots exist or are filtered; the spot IDW from map-hours stays as
  the fallback.
- Colour: the knot scale of the approved mockup (`WIND_KT_STOPS` in
  `mapSwellField.ts`, 0–40 kn) — particles are batched into 14 colour bins
  (one stroke per bin) and take the colour of the cell they are in, not the
  one they spawned in. Legend shows the same bar with the current grid
  min–max marked.

## Sea grid (`public/data/sea-grid.json`)

- Built by `scripts/build-sea-grid.js` in `update-data.yml` (full runs, only
  when the file is ≥ 5.5 h old): Open-Meteo forecast (`wind_speed_10m`,
  `wind_direction_10m`) + marine (`wave_height`, `swell_wave_*`, fallback
  `wave_*`) on a regular **0.5° grid** over three boxes (mainland incl.
  Galicia/Gulf of Cádiz, Azores, Madeira), **55 hourly steps** from the
  current hour. ~394 locations per API per run (deep-inland Iberia skipped);
  the calls are added to `pipeline-meta.json` `openMeteoUsage.dailyWeightedCalls`.
- Compact format (v1): `u`/`v` (0.25 m/s, offset 128), `hs` (0.1 m), `dir`
  (360/256°), `per` (0.1 s) as Uint8 arrays, base64, layout `[t][node]`;
  255 = no data. ~160 KB raw, ~80 KB gzip. Format + quantization in
  `scripts/lib/seaGrid.js`, decoder in `src/lib/seaGrid.ts` (`parseSeaGrid`,
  `seaGridFrame`, `sampleSeaGrid`). The decoder extends swell one ring into
  coast/land nodes so the bilinear field reaches the shoreline; land is cut
  with `pointOnLand`.
- Time: `t0` (unix s) + `stepHours` — the 48 h scrubber maps its
  map-hours step (Lisbon local) to a fractional index; «Agora» uses the
  wall clock. Older than 30 h or not covering the hour → swell hides,
  wind falls back to IDW.

## «Ondulação» layer (`mapSwellField` + `useMapSwellField`)

- Toggle `data-map-swell-toggle`, pref `ventu.map.swell`, deep link and
  share `?swell=1`, mirrored to the URL on toggle (merge, other params kept).
- Hs field: bilinear sample per 3 px (4 px mobile) of the view, drawn
  upscaled with smoothing; alpha fades with the share of valid sea nodes.
- Isolines every 0.5 m (marching squares on the grid refined ×4/×8/×16 by
  zoom; land and coast-edge cells are NaN so lines never cross land), one
  label per level with constant pixel size.
- Crests: triangular lattice with **constant screen-pixel spacing (30 px)**
  anchored to the map's world-pixel origin (pans keep crests over the same
  sea), rebuilt on every `zoomend`/`moveend`; each frame is cleared (no
  trails) and the pane is `leaflet-zoom-hide`, so nothing is stretched or
  smeared across zoom levels. 30 fps cap, pauses after 20 s idle,
  `document.hidden` skip, 6 alpha bins → 6 strokes per frame.
- Spot symbols (visible ocean spots, 34 px collision): arrow in the swell
  direction with length ∝ Hs (12–72 px), chevrons by period (< 8 s · 8–11 ·
  11–14 · ≥ 14 s), constant pixel size.
- Tooltip (fine pointer only, `aria-hidden`; the legend carries the text):
  position, wind (when the wind layer is on), Hs, period, swell direction,
  Lisbon time.
- `prefers-reduced-motion`: field + isolines + symbols, no crests.

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
  34°W–1°E), resampled to ~2 km/px (0.02°), written as 1400×960 WebP (0.025°,
  q70, ≤ 12 frames retained). Two products per slot,
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
