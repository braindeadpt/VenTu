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

- **v3 (2026-10): gridded models, no per-call quota, zero Open-Meteo calls.**
  Built by `scripts/build-sea-grid.js` in its **own job** `sea-grid` of
  `update-data.yml` (parallel to `validate-data`, `timeout-minutes: 8`,
  `continue-on-error`) — never inside `update-conditions`, so it cannot
  touch the MTG time budget. Only rebuilds when the committed file is
  ≥ 5.5 h old (≈ 4×/day, the GFS cycle); the run takes ~15–60 s.
- **Source**: PacIOOS ERDDAP (University of Hawaiʻi / NOAA IOOS), griddap CSV,
  keyless:
  - `ncep_global` — NOAA **GFS 0.5°**, 3-hourly, 8 days: `ugrd10m`, `vgrd10m`;
  - `ww3_global` — **WaveWatch III global 0.5°**, hourly, ~7 days: `Thgt`
    (Hs), `sdir`/`sper` (swell), `Tdir`/`Tper` (total sea, fallback).
  `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/{ncep_global,ww3_global}.html`.
  The ERDDAP reloads datasets now and then (404 «unknown datasetID» for a
  few seconds) → 4 attempts with growing back-off, 2 requests at a time.
  **The PacIOOS WW3 has no Mediterranean / Black Sea / Baltic** (Hs = NaN):
  those seas get wind only (`WIND_ONLY_SEAS` stores their nodes) and the
  swell layer shows nothing there.
- **Domain / boxes** (`TIERS`, all on the 0.5° lattice, nested, finest first):
  | id | step | extent |
  |---|---|---|
  | `core` | 0.5° | 24–52 N × 38 W–6 E (Azores, Madeira, Canaries, Iberia, Biscay, Alborán) |
  | `regional` | 1° | 14–60 N × 56 W–14 E |
  | `ocean` | 2° | **0–72 N × 100 W–44 E** (whole North Atlantic + Med + North Sea) |
  Stored nodes: WW3 sea (or a wind-only sea), and in a coarse box only
  outside the finer box's interior (shrunk by the 2-cell blend + one coarse
  cell). **17 steps, 0–48 h every 3 h.** `fade: 4` = 4° feather at the outer
  border only.
- Format **v3** = v2 + `fade` (+ `stepHours: 3`, `u`/`v` at 0.5 m/s, offset
  128 → ±63.5 m/s). **~810 KB raw, ~380 KB gzip** (~7 300 stored nodes),
  lazy (only fetched with «Vento»/«Ondulação» on in fullscreen). v1/v2 still
  parse (the e2e stubs use the v2 encoder `encodeSeaGrid`).
- **Nearest-sea fill (v3, `fillFromSea`)**: after decoding, every box is
  filled ring by ring (BFS, 8-neighbours, mean of already-filled
  neighbours): wind over the whole box, swell up to 1.5° from model sea plus
  a 1.5° coverage fade (`cov`). Bilinear sampling right at the coast thus
  reads real sea values — **no dark gap** between the field and the beach —
  and the vector clip below makes the edge crisp. Where WW3 has no sea at
  all (Med) the coverage fades with distance, never with a straight cut.
- **Sampler** (`sampleSeaGrid`): unchanged multi-box blend (finest first,
  `smoothstep` over the last 2 fine cells); `w` = coverage-weighted share of
  valid swell nodes; `edge` = `fade` feather at the outer border.
- **No rectangle**: `useSeaDomainBounds` (fullscreen `/mapa` only) sets
  `maxBounds` to the domain **inside the fade** (4–68 N × 96 W–40 E,
  `SEA_DOMAIN_VIEW_BOUNDS`, viscosity 1) and `minZoom` to the smallest zoom
  whose whole view fits in it (`getBoundsZoom(bounds, true)`, ≥ 3, redone on
  resize; 4 on a 1440×900 desktop). The field border never reaches the
  screen at any zoom.
- Time: `t0` (unix s) + `stepHours` — the 48 h scrubber maps its map-hours
  step (Lisbon local) to a fractional index; «Agora» uses the wall clock.
  Older than 30 h or not covering the hour → swell hides, wind falls back to
  IDW.

## Vector land clip (`src/lib/landClip.ts`, `public/geo/land-clip/`)

- Wind and «Ondulação» no longer clip land with the raster `pointOnLand`
  (staircase of ~500 m cells, black gap). The field is drawn first, then
  land is **cut away with polygons projected to the screen**
  (`destination-out`, even-odd, Canvas2D anti-aliasing) — crisp coast at
  every zoom.
- Polygons baked offline by `scripts/bake-land-clip.py` (shapely; result
  committed, static, not pipeline data): **GADM 4.1 PT+ES at full
  resolution** (matches the basemap coastline) + **Natural Earth 10m land**
  for everything else (France, Morocco, the UK, America, Africa, islands).
  **Inland waters are land**: 1 km morphological closing around Iberia
  (Ria de Aveiro, Ria Formosa, Óbidos, Mondego…), explicit closers for the
  Tejo and Sado mouths, holes < 3000 km² filled. Open coast stays exact.
- Four zoom tiers (`index.json`): z0–4 (180° tiles), z5–6 (20°), z7–8 (10°),
  z ≥ 9 (5°), each simplified to ~0.6 px at its reference zoom. Rings are
  integer world pixels (Web Mercator, Leaflet's EPSG:3857 convention) at
  the tier's quantisation zoom, delta-encoded. 3.2 MB on disk in ~670
  files, but a view only fetches the tiles it touches (**~10–60 KB gzip**).
- One `Path2D` per (tier, tile set) is built once in quantised coordinates
  and drawn with a transform (`scale 2^(zoom−zq)`, canvas origin) — pans and
  zooms never re-project vertices. Until the view's tiles arrive nothing is
  painted (never land colouring while loading); if `index.json` is missing
  the old raster mask is the fallback (`data-map-*-clip="raster"`).
- **Screen land mask** (`buildScreenLandMask`): the same path rasterised at
  half resolution once per view (shared by both layers, cached by view
  key). Wind particles spawning or moving onto land die and respawn at sea;
  swell crests, isoline labels and the tooltip check it too. Isolines are
  drawn before the cut, so they stop exactly at the coast; spot symbols are
  drawn after it (spots live on the beach).
- Shared paint code: `src/lib/seaFieldPaint.ts` (raster, isolines,
  projection) — the hooks and the offline visual check render through the
  same functions. Test hooks: `data-map-swell-clip` /
  `data-map-windfield-clip` = `vector` | `raster` | `loading`.
- The raster `land-mask.json` stays for Hs/SST/currents and as fallback.

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
  upscaled with smoothing; alpha fades only at the domain border and where
  the model has no sea (v3 is filled up to the coast); land is then cut by
  the vector clip.
- Isolines every 0.5 m (marching squares on the grid refined ×4/×8/×16 by
  zoom, two NaN-aware box-blur passes of half a grid cell and the level
  taken half a quantum low — Hs is quantised to 0.1 m, which otherwise
  drew staircases on plateaus), clipped by the land cut; one label per level
  with constant pixel size, never on land.
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
