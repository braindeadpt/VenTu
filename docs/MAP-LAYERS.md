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
| 342 | `swellfield` | **«Ondulação»** — Hs colour field + 0.5 m isolines + spot swell symbols (canvas) and slow swell crests (second canvas) | from `sea-grid.json`; driven by the top «Vento \| Ondulação \| Nenhum» selector — mutually exclusive w/ wind and SST |
| 345 | `windfield` | **wind particle field** | ambient, animated; colour by knots |
| 348 | `sst` | SST ribbon | mutually exclusive w/ Hs |
| 350 | `hs` | legacy Hs IDW field (spot interpolation) | **not in any menu since 2026-10** — `?hs=1` and a stored `ventu.map.hs` pref migrate to «Ondulação»; code kept, never enabled |
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
- **Land mask** (`src/lib/landMask.ts`), two tiers behind one
  `pointOnLand(lat,lon)`:
  1. bundled GADM 4.1 PT+ES raster (`landRings.ts`, `scripts/bake-land-rings.mjs`)
     at ~600 m, lat 32–43 N — always there, sync;
  2. **lazy full-domain mask** `public/data/land-mask.json` (**~26 KB raw,
     ~13 KB gzip**) baked by `scripts/bake-land-mask.mjs` over 26.5–46.5 N ×
     34–1 W at 0.005° (~500 m): GADM rings for Iberia/Azores/Madeira +
     Natural Earth 50m land for the rest (Morocco, France, Canaries,
     Gibraltar). Stored as per-row transition columns (varint, base64);
     the client keeps the transitions and binary-searches them (no bitmap).
     `useSeaGrid` loads it in parallel with the grid and only hands the grid
     out once it settled, so wind/«Ondulação» never paint Galicia, the
     Cantabrian coast, Andalusia or Morocco. Once loaded it also serves
     SST/currents. Regenerate: `node scripts/bake-land-mask.mjs [--ne ne_50m_land.geojson]`.
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
  hour — the field then covers the whole sea (Azores → Morocco → Biscay)
  and does not depend on which spots exist or are filtered; the spot IDW
  from map-hours stays as the fallback.
- Sea-grid grids (`buildWindFieldGridsFromSea`): one flow grid per 0.5° box
  (first) + one domain grid for the rest of the ocean, all filled from the
  multi-box sampler (no seams between grids). Grids carry `landClip`:
  `windCellAnywhere` rejects any particle position on land
  (`pointOnLand`), so particles stop exactly at the coastline (mask
  resolution, ~500 m) instead of at cell resolution. The field fades over
  the last ~1° of the outer domain (`edge`).
- Colour: the knot scale of the approved mockup (`WIND_KT_STOPS` in
  `mapSwellField.ts`, 0–40 kn) — particles are batched into 14 colour bins
  (one stroke per bin) and take the colour of the cell they are in, not the
  one they spawned in. Legend shows the same bar with the current grid
  min–max marked.

## Sea grid (`public/data/sea-grid.json`)

- Built by `scripts/build-sea-grid.js` in `update-data.yml` (full runs, only
  when the file is ≥ 11.5 h old, and only if the quota guard allows — see
  below): Open-Meteo forecast (`wind_speed_10m`, `wind_direction_10m`) +
  marine (`wave_height`, `swell_wave_*`, fallback `wave_*`), **55 hourly
  steps** from the current hour.
- **Boxes (v2)** — all on the same 0.5° lattice, so coincident nodes are
  requested once:
  | id | step | extent | nodes fetched |
  |---|---|---|---|
  | `atlantic` | 1° | 26.5–46.5 N × 34.5–0.5 W (Azores → Morocco → Biscay) | sea nodes (sea within 0.6 cell) |
  | `mainland` | 0.5° | 35.5–44.5 N × 11.5–1.5 W (incl. Galicia, Cantabrian coast, Gulf of Cádiz, Strait) | coastal only (land ≤ 1°, sea ≤ 0.6 cell) |
  | `azores` | 0.5° | 36.5–40 N × 31.5–24.5 W | coastal only |
  | `madeira` | 0.5° | 32–34 N × 18–15.5 W | coastal only |
  Node selection uses `land-mask.json` (falls back to the v1 deep-inland
  heuristic without it). **~840 unique locations per API per run**
  (atlantic 651 + coastal 263, minus coincident nodes).
- Compact format **v2**: per-box `step`, `offset`/`count` over the *stored*
  nodes and an optional `mask` (base64 bitset, LSB first) — open sea far
  from the coast in the fine boxes and deep land take no bytes. Fields `u`/`v`
  (0.25 m/s, offset 128), `hs` (0.1 m), `dir` (360/256°), `per` (0.1 s) as
  Uint8, base64, layout `[t][stored node]`; 255 = no data. **~330 KB raw,
  ~190 KB gzip** (v1 was ~160/~80 KB for three boxes). v1 files still parse
  (`legacy`: non-overlapping boxes, half-cell border, one-cell feather).
  Format + quantization in `scripts/lib/seaGrid.js`; decoder in
  `src/lib/seaGrid.ts` (`parseSeaGrid` expands to the full nx·ny layout with
  NaN for missing nodes, then dilates swell one ring into land/coast nodes).
- **Sampler** (`sampleSeaGrid`): boxes containing the point, finest first.
  Each fine box contributes with weight `smoothstep(d / (2·step))` (d = distance
  inside its node hull → the blend spans the last **2 fine cells**) times
  the share of valid nodes under the point; whatever weight is left goes to
  the next coarser box. Open sea where the fine box stores no nodes falls
  through to the 1° backdrop. No seams, no box edges. The outermost box sets
  `edge`, a ~1° feather to the outer domain border (v1: one cell).
  `seaGridExtent` = union of the boxes; isolines are computed on one
  lattice (finest step / refine, anchored to multiples of the step, cropped
  to the view + 40 %) instead of per box, so overlapping boxes never draw
  twice.
- **Quota** (Open-Meteo free tier: 10 000 weighted calls/day, 600/min):
  1 location = 1 call (≤ 10 variables, ≤ 14 days). Per run 2 × ~840 ≈
  **1 680** calls; at most **2 runs/day** (11.5 h gate) → ≤ 3 360/day.
  `update-conditions` is budgeted at ~7 964 (winter) / ~8 326 (summer) per
  day in the worst case (all multi-model anchors land; measured days in
  Oct 2026 were ~3 000–5 400). The script therefore runs a **guard**:
  today's `openMeteoUsage.dailyWeightedCalls` + the conditions calls still
  scheduled until 00 UTC (worst case, from `updateSchedule.js`) + this grid
  must be ≤ **9 000** (90 %), otherwise it skips and the previous file stays.
  Requests go in batches of 50 every 6 s (~500/min). Calls are added to
  `pipeline-meta.json` `openMeteoUsage.dailyWeightedCalls` / `seaGridCalls`.
- Time: `t0` (unix s) + `stepHours` — the 48 h scrubber maps its
  map-hours step (Lisbon local) to a fractional index; «Agora» uses the
  wall clock. Older than 30 h or not covering the hour → swell hides,
  wind falls back to IDW.

## «Vento | Ondulação | Nenhum» selector (`MapSeaModeSwitch`)

- Always visible on `/mapa` (fullscreen, not hero embeds), top-centre; the
  time pill sits right below it (`top-[60px]`), the mobile legend below
  both (`top-28`). With the desktop panel open both re-centre on the free
  strip (`globals.css`, `--map-panel-offset`).
- `role="radiogroup"` + `role="radio"`/`aria-checked`, roving tabindex,
  ←/→/↑/↓/Home/End, visible focus ring, 36 px pill + 44 px hit area.
  Labels `mapUiLayers.seaModeGroup|seaModeWind|layerSwell|seaModeNone`
  (PT/EN/ES/DE/FR).
- Drives the existing toggles, mutually exclusive on `/mapa`: «Vento» =
  wind field + pin wind arcs (`ventu.map.wind`), «Ondulação» = swell layer
  (`ventu.map.swell`), «Nenhum» = both off. Turning wind on anywhere else
  (stack button, explore sheet) turns swell off and vice versa; at mount
  with both on (pref + `?swell=1`) swell wins.
- URL: `?swell=1` (swell), `?wind=1` / no param (wind), `?wind=0` (none —
  needed because wind defaults on on desktop). Legacy `?hs=1` → swell.
  Share links follow the same contract (`windOff` → `wind=0`).
- The legend follows the selection (wind knots bar ↔ «Ondulação · Hs (m)»).
- «Ondulação» and the old IDW «Altura significativa (Hs)» are no longer in
  the «Camadas» menu (desktop popover or mobile sheet): one source of truth.

## «Ondulação» layer (`mapSwellField` + `useMapSwellField`)

- Selected via the top selector (above); pref `ventu.map.swell`, deep link
  and share `?swell=1`, mirrored to the URL (merge, other params kept).
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
