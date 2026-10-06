# External data sources — research & PoC

> **Status: investigation only. Nothing is integrated.**
> No code, pipeline, schema, score, or UI was changed. Every "verified" row was
> live-called on 2026-09-29; "docs-only" rows were not. Licences and endpoints
> must be revalidated before implementation.

## What we verified today (live PoC)

| # | Source / call | Result | Payload |
|---|---|---|---|
| 1 | NASA GIBS — SST MUR tile z7/48/60 | ✅ 200 PNG 256×256 | 9.2 KB |
| 2 | NASA GIBS — MODIS true-color z7/48/60 | ✅ 200 JPG | 4.8 KB |
| 3 | NASA POWER — climatology point (Ericeira) | ✅ 200 JSON | ~1 KB |
| 4 | Open-Meteo Air Quality — `uv_index` + `european_aqi`, 48 h | ✅ 200 JSON | 1.6 KB |
| 5 | Open-Meteo Ensemble — `ecmwf_ifs025`, wind 48 h | ✅ 200 JSON, **51 members** | 16 KB |
| 6 | Open-Meteo Marine — swell vs wind wave split | ✅ already separate vars | — |
| 7 | EMODnet ERDDAP — HFR-Lisboa measured current | ✅ 200 CSV | 144 B / point |
| 8 | IH OGC EDR — `tide_obs_nrt` Cascais (152-303) | ✅ 200 CoverageJSON | 162 KB / 24 h |
| 9 | MeteoAlarm — Portugal Atom feed | ✅ 200 XML, 25 entries | 39 KB |
| 10 | NOMADS — `filter_gfswave.pl` Iberia subset f006 | ✅ 200 **GRIB2** | 3.3 KB |
| 11 | euskoos ERDDAP — `IBI_ANALYSIS_FORECAST_WAV_005_005` | ⚠️ **subset lat ≥ 43.2 — Biscay only, does NOT cover Portugal** | — |

## Exact endpoints (copy-paste verified)

```
# GIBS tiles (no key). Matrix set differs per layer — read WMTSCapabilities.
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/
  GHRSST_L4_MUR_Sea_Surface_Temperature/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png
  MODIS_Terra_CorrectedReflectance_TrueColor/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg
# Capabilities: .../best/1.0.0/WMTSCapabilities.xml (5.7 MB — parse once, cache)

# NASA POWER climatology (no key)
https://power.larc.nasa.gov/api/temporal/climatology/point
  ?parameters=WS10M,T2M&community=RE&longitude={lon}&latitude={lat}&format=JSON
# → monthly JAN..DEC + ANN means, 2001–2020 baseline (MERRA-2)

# Open-Meteo (all no key, CC-BY-4.0 attribution required)
https://ensemble-api.open-meteo.com/v1/ensemble
  ?latitude={lat}&longitude={lon}&hourly=wind_speed_10m&forecast_days=7&models=ecmwf_ifs025
# → var + var_member01..member50, km/h, hourly
https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude={lat}&longitude={lon}&hourly=uv_index,european_aqi&forecast_days=5
https://marine-api.open-meteo.com/v1/marine
  ?...&hourly=wave_height,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction
# NOTE: OM Marine ALREADY splits swell vs wind wave — primary partition is free today.
# CMEMS gain = secondary swell + nearshore resolution, not "swell vs chop".

# EMODnet Physics ERDDAP — measured HF-radar currents (no key)
https://erddap.emodnet-physics.eu/erddap/griddap/
  EUHFR_NRTcurrent_HFR-Lisboa-Total.csv
  ?EWCT[(last)][0][({lat})][({lon})],NSCT[(last)][0][({lat})][({lon})]
# dims: time×depth×lat80×lon119, hourly, m s-1. Coverage Lisboa ~S.Julião–Espichel.
# Also: HFRADAR_LISBOA_Totals, HFR-Galiza, HFR-Algarve (S.Vicente→Mazagón).

# IH OGC API — observed sea level (no key)
https://ogcapi.hidrografico.pt/collections/tide_obs_nrt/locations/{id}?f=json
# → CoverageJSON PointSeries, 1-min SSH vs ZH Portugal (EPSG:10349), ~24 h window
# 10 stations nationwide. data_queries: instances, locations, area, radius.
# Buoy positions: .../collections/buoys_datawell (WFS/OGC Features).

# MeteoAlarm PT (no key)
https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-portugal  # Atom, CAP entries

# NOMADS gfswave (no key; index/grib2 via byte-range or regional filter)
https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl
  ?dir=/gfs.{YYYYMMDD}/00/wave/gridded&file=gfswave.t00z.global.0p25.f{fff}.grib2
  &var_HTSGW=on&var_PERPW=on&var_DIRPW=on&subregion=&leftlon=-12&rightlon=-6&toplat=44&bottomlat=35
# → GRIB2 subset ~3 KB/step; needs wgrib2/cfgrib to decode.
```

## Payload & volume estimates (140 spots)

| Feature | Pattern | Per-run cost | Notes |
|---|---|---|---|
| GIBS satellite/SST/chl layer | Client tiles, browser cache | ~5–10 KB/tile; ~20–40 tiles/viewport | Zero pipeline; add `TIME` to scrubber |
| POWER climatology per spot | One-off batch → static JSON | 140 × 1 KB = **140 KB once** | Regenerate yearly, if ever |
| OM Ensemble (confidence) | GH Action 3 h → per-spot JSON | 140 × ~50 KB(7d) ≈ **7 MB/run** | Trim to quantiles (p10/p50/p90) → ~1–2 MB |
| OM UV + AQI chips | Extend existing OM call | ~1.6 KB/spot → **~220 KB/run** | Merge into existing forecast payload |
| HFR currents overlay | Batch grid download → tiles/JSON | full grid ~40 KB/hr compressed | Or viewport subset server-side |
| IH tide observed SSH | Extend IH fetch | 162 KB × 10 stations × 8/day | Keep 6 h only → ~15 KB/run |
| gfswave consensus | GH Action decode → JSON | 3 KB/step × ~40 steps Iberia | Requires grib decode tooling |

## Recommendations (effort × value)

**Phase A — near-zero cost, do first** — **IMPLEMENTADA (2026-09-29)**

1. ~~✅ **GIBS map layer** («Satélite NASA»)~~ — **REMOVIDA (Fase 3)**. O
   MODIS Terra true-color (cadência diária, quase sempre nublado sobre a
   costa) saiu do mapa. O toggle «Satélite IR» (`ventu.map.goesIr`,
   `?goesIr=1`, `data-map-goes-ir-toggle`, pane `ventu-goes-ir` z206) é hoje
   servido **primário pela pipeline MTG-I1** (`fetch-mtg-ir.py` →
   `sat-mtg.json` + frames WebP, EUMETSAT Data Tailor — Meteosat a 0° cobre
   PT na resolução nativa ~2 km) com **fallback GOES-East GIBS** keyless
   quando o manifest está ausente/stale. `src/lib/gibsSatellite.ts` sobrevive
   só com `gibsTileMaskBlank` (máscara de tiles sem dados do fallback).
   Conta para o cap de raster pesadas (máx. 2 de radar/nauticalChart/goesIr).

   **MTG-I1 FCI — VIS de dia / IR de noite** — `scripts/fetch-mtg-ir.py`
   (Python: eumdac + rasterio + pillow, `scripts/requirements-mtg.txt`):
   procura ciclos FDHSI (`EO:EUM:DAT:0662`), submete jobs Data Tailor
   (janela de 3 concurrent — quota da conta), ambos com projection
   geographic + resample 0.02°/px sobre a ROI `ventu_iberia_atlantic`
   (28–52°N/34°W–1°E). A escolha por slot é solar (elevação > ~15° sobre o
   centro da ROI — abaixo disso a foto sai demasiado escura): de dia usa a
   chain `ventu_fci_vis_png` (filtro
   `natural_color` → foto RGB opaca, re-encodada WebP); de noite usa
   `ventu_fci_ir_geotiff_hr` (filter `ir_105_effective_radiance`) e
   converte radiância → temperatura de brilho (Planck, ν=954.7 cm⁻¹) →
   paleta de topo de nuvem translúcida → WebP RGBA. Manifest
   `sat-mtg.json` carrega `kind` por frame. Creds:
   `EUMETSAT_CONSUMER_KEY/_SECRET` (eoportal → api.eumetsat.int/api-key,
   registo gratuito). **Licença**: a cadência horária serve frames ≥1 h =
   «Core» CC-BY-4.0; frames <1 h são «Recommended» (grátis só para
   investigação/educação/pessoal) — não subir a cadência sem rever.
   *Nota: o SST medido (MUR) continua de fora — o campo SST do modelo já
   cobre a leitura; pode entrar como camada «SST observada» se fizer falta.*
2. ✅ **POWER climatology** — `scripts/fetch-climatology.js` →
   `public/data/climatology.json` (uma entrada por spot: vento/ar/chuva
   mensais + anuais, baseline MERRA-2 2001–2020). Não entra na cadência
   ~3 h (o baseline é fixo) — corre via `npm run data:climatology`. UI:
   `SpotClimateCard` («Clima do spot») na secção «No local» com barras de
   vento mensais + mês corrente em destaque + fonte NASA.
3. ✅ **UV index + AQI** — `uv_index` entrou no pedido horário Open-Meteo
   existente (custo zero) → `uvIndex` em todas as linhas de forecast +
   `uvIndex`/`uvIndexMax` nas condições; `european_aqi` via script próprio
   `scripts/fetch-air-quality.js` (host separado = quota separada, nunca
   bloqueia o pipeline) → `air-quality.json` → merge em
   `airQualityIndex`/`airQualityAt` só quando fresco (<8 h). UI: linha UV
   condicional na `ForecastTable` + chips UV máx./AQI no detalhe do
   instrumento de vento (AQI só na hora corrente).

**Phase B — product differentiation**
4. **Ensemble confidence** — p10/p50/p90 band on wind/wave in scrubber + spot hourly; "70% chance de score >80" from member histogram. Store quantiles, not 51 members.
5. **Forecast accuracy badge** — OM Previous Runs vs. IH buoy/boia obs → "acertou X% nos últimos 7 dias". Credibility differentiator no Portuguese site has.
6. **Tide anomaly** — IH observed SSH − predicted tide → storm-surge/ressaca flag.

**Phase C — heavier**
7. **HFR measured currents** — Lisboa/Galiza/Algarve overlays + spot chips. Coverage is partial (Lisboa is the only PT-facing network verified live).
8. **CMEMS IBI secondary swell** — needs free CMEMS account + Python Toolbox (NetCDF). The public ERDDAP mirror we found is **Biscay-only**; verify coverage/licence before betting on it. Until then, OM Marine's swell/wind-wave split covers the primary use case.
9. **WW3 model consensus** — gfswave GRIB2 subset works (verified); adds a second wave model for agreement score. Needs decode tooling in the pipeline.

**Not worth it (verified)**
- RainViewer — licence limited to personal/educational/community use; IPMA radar already covers PT.
- Puertos del Estado — licence forbids transfer to third parties → can't redistribute.
- OpenUV free tier (50 req/day) — OM Air Quality replaces it.
- met.no — redundant; OM already aggregates MET Norway.
- OSCAR currents — weekly/0.33°, worse than HFR + CMEMS.

## Licence & risk matrix

| Source | Auth | Licence | Risk |
|---|---|---|---|
| GIBS | none | NASA open data, credit required | Low — add attribution line |
| POWER | none | NASA open data | Low |
| Open-Meteo | none | CC-BY-4.0 (non-commercial free tier) | Existing assumption — confirm tier if monetised |
| EMODnet ERDDAP | none | CC-BY per dataset | Low-mid — mirror availability not SLA'd |
| IH OGC/EDR | none (some APIs need free key) | dados abertos (HVD) | Low — confirm attribution terms |
| MeteoAlarm | none (Atom); token for EDR redistribution | EUMETNET terms | Mid — Atom fine; check re-publishing |
| NOMADS | none | US Gov public domain | Low — throttle requests |
| CMEMS | free account | Copernicus licence + attribution | Mid — register + test coverage PT |

## Non-goals confirmed
- No new vendor replaces Open-Meteo/IH/IPMA — all candidates are additive.
- Nothing runtime-per-user: everything fits GH-Actions → `public/data/` (static export stays intact), except GIBS/EMODnet tiles which are client-side layers the providers explicitly serve for browsers.
