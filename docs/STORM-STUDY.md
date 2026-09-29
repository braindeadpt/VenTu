# STORM-STUDY — avisos de tempestade: mapa, spot e alertas

Estudo encomendado 2026-09-29; actualizado após sonda de fontes oficiais.

Pedido do owner: alertas para o utilizador, alertas por spot, e indicação
dinâmica no mapa de tempestade **a aproximar-se / iminente / em curso** —
com animação.

## Âmbito de cobertura (requisito)

**Mínimo: toda a Península Ibérica + todo o mar até aos Açores e Madeira, e
arredores.** Ou seja, o rectângulo operacional é sensivelmente
**~28–45 N, ~5–32 W** — que é também o enquadramento natural do mapa Ventu.
Toda a escolha de fonte em baixo foi avaliada contra este rectângulo:

| Zona | Fonte primária de «tempestade» |
|---|---|
| Costa/continente PT+ES | IPMA avisos (polígonos) + radar IPMA animado + avisos IH |
| Atlântico até Açores | **NHC cone/track** (ciclones) + **GOES-East IR 10 min** (nuvens/células) |
| Madeira / Canárias / Norte de África | IPMA/MET avisos + GOES-East IR + NHC quando aplicável |

## Fontes oficiais prontas — verificadas ao vivo (2026-09)

### A. NOAA NHC — ciclones tropicais ✅ (o produto literal de «a aproximar-se»)

- `https://www.nhc.noaa.gov/CurrentStorms.json` — keyless, oficial.
  Sonda real: **6 tempestades activas**, incl. `Hanna TS` 34,6°N 45,5°W →
  NE @ 12 mph (trajecção directa para a região dos Açores).
- Por tempestade: posição, classificação (TD/TS/HU), vento máx, pressão,
  **movimento (direcção + velocidade)**, e links GIS por advisory:
  `forecastTrack`, `trackCone`, `windWatchesWarnings`,
  `initialWindExtent`, `forecastWindRadiiGIS`, `earliestArrivalTimeTSWindsGIS`,
  `bestTrackGIS` — em KMZ e zip de shapefiles/GeoJSON.
- Cobre a bacia `al` (Atlântico N) inteira — inclui Açores, Madeira,
  Canárias e aproximações à costa Ibérica.
- Encaixa no padrão do projecto: fetcher → `storms.json` → camada Leaflet
  (cone + linha de track + etiqueta classe/vento) + estado por spot.

### B. NASA GIBS — GOES-East ABI Band13 Clean IR ✅ (satélite quase-real)

- Verificado no WMTS epsg3857 que já usamos: camada
  `GOES-East_ABI_Band13_Clean_Infrared`, **cadência PT10M** no capabilities,
  tile real servido (PNG ~70 KB, `GoogleMapsCompatible_Level6`).
- Tops de nuvens frias = células de tempestade a formar-se no Atlântico —
  o «a aproximar-se» visível ~1000 km antes da costa.
- Mesma infra da camada GIBS existente (`GIBS_SATELLITE_URL` + pane) —
  muda o layer id, o tile matrix `Level6` (~1,2 km/px, aceitável p/ nuvens)
  e o slot TIME com timestamp a 10 min.
- Caveat honesto: Portugal continental fica perto do limbo do disco GOES
  (satélite a 75°W) — resolução degrada a Este; para a costa o radar IPMA
  continua a ser a fonte fina. Açores/Madeira/Atlântico = cobertura plena.

### C. MeteoAlarm CAP — polígonos de aviso ⚠️ (precisa key)

- O feed CAP traz **geometria por aviso** (polígonos reais, não só distrito).
- Fetcher + resolução de auth já existem (`fetch-meteoalarm-warnings.js`,
  `resolveWarningsAuth`, `docs/METEOALARM_API_KEY.md`); hoje é fallback do
  IPMA e não guarda geometria.
- Decisão: usar polígonos CAP (precisa `METEOGATE_API_KEY`) **ou** bake de
  GeoJSON de distritos (asset estático único) a partir do `areaCode` IPMA.

### D. IPMA radar animado ✅ existente — mas só passado

- 12 frames × 5 min (última hora), carrossel Leaflet com pause/prefs.
- Manifest oficial (`imgs-radar.json`) só tem produto `pcr` — **não há
  nowcast IPMA** publicado. «A aproximar-se» é implícito no movimento.

### Dead-ends confirmados

- IPMA satélite/descargas `resources.www/transf/*` → 404 em todos os padrões
  sondados (`descargas`, `satelite`, `meteosat`, `obs-sat`).
- RainViewer (+30 min nowcast tiles) → licença limitada a uso pessoal/
  educativo/comunitário (`docs/EXTERNAL-DATA.md`).
- Blitzortung/lightning → tile server não-oficial, ToS cinzento.
- IH → não tem produto de tempestade meteorológica (nav warnings já cobertos).

## Inventário do que já existe

| Camada | Fonte | Lacuna para «tempestade» |
|---|---|---|
| Radar IPMA animado (`radar.json`, `L.ImageOverlay`) | IPMA | só passado |
| Avisos IPMA (`warnings.json`, `spotWarnings` → 100 spots) | IPMA | distrito+texto, sem geometria no mapa |
| MeteoAlarm fallback | CAP | sem geometria persistida |
| Avisos costeiros IH (188, polígonos no mapa) | IH | navegação, não meteo |
| Alertas utilizador (`evaluate-alerts.js`) | score | **só dispara com score ≥ limiar** — avisos entram como contexto, nunca como gatilho |
| GIBS true-color | NASA | mosaico diário — não é tracking |

## Blocos de implementação (sequência revista)

### B0 — NHC tempestades tropicais (fonte A) — o «a aproximar-se» oficial

- `scripts/fetch-nhc-storms.js` → `public/data/storms.json`: lista activa da
  bacia `al`, campos posição/classe/vento/pressão/movimento + track points +
  cone (parse KMZ→GeoJSON no fetcher; shapefile zip alternativo).
- Filtrar ao rectângulo alargado (~20–50 N, 10–45 W) para não poluir com
  Caribe/Golfo — mas guardar a tempestade quando o **cone** toca o rectângulo,
  mesmo com o centro fora.
- Mapa: camada «Tempestades» (pane próprio, grupo TEMPO): cone translúcido +
  track com pontos datados + etiqueta «Hanna · TS 55 km/h → NE».
  Animação: track desenhado progressivamente / pulse subtil no centro —
  reduzido a estático com `prefers-reduced-motion`.
- Spot: badge quando o cone toca o spot (Açores primeiro) — «Tempestade
  tropical {nome}: cone de incerteza cobre este spot · ETA {dia}».
- Budget pequeno; `continue-on-error` no workflow (o feed falha → camada
  omite, nunca mostra tempestade inventada).

### B1 — Estado de tempestade por spot (derivação local)

- PNG do radar mais recente → eco a ≤X km → `{ limpo | perto | sobre, distKm }`.
- Centróide do eco em 2–3 frames → vector «a aproximar-se de W ~25 km/h».
- Nível IPMA do distrito + NHC cone → estado composto por spot.
- Artefacto `storm-state.json` → badge spot + contexto mapa.
- Verificar decoder de imagem (`sharp` — já nas deps para OG images?).

### B2 — Polígonos de aviso no mapa

- CAP MeteoAlarm (key) ou GeoJSON distritos baked + `areaCode` IPMA.
- Cor por nível; **pulsação subtil só no vermelho**.

### B4 — Alertas de aviso para o utilizador

- Gatilho independente do score: favorito com IPMA ≥ laranja, IH §0, ou
  **cone NHC a tocar o spot** → email/Telegram.
- Flag `warn` em `user_alert_prefs` + path no evaluator + template ×5 locales.
- Reusa tokens/confirm/unsubscribe/cooldowns existentes.

### B5 — Satélite IR animado (fonte B)

- Camada «Satélite IR (10 min)» no grupo TEMPO: mesmo padrão GIBS +
  carrossel TIME (últimos ~2–3 h a 10 min) — herda o padrão do radar.
- Opcional: misto IR+radar — IR mostra a massa de nuvens vinda do Atlântico,
  radar mostra a chuva já sobre a costa.

### B3 — Advecção própria (downgrade: opcional)

- Com NHC+GOES+radar, extrapolação caseira vale pouco — manter só se após B0/
  B5 ainda faltar «chuva chega em X min» ao nível da praia.

## Sequência

1. **B0 + B1 + B4** — fonte oficial de «aproximação», estado por spot e
   alerta de utilizador (partilham `storms.json`/`storm-state.json`).
2. **B5** — satélite IR animado (camada, esforço baixo sobre infra existente).
3. **B2** — polígonos IPMA/CAP no mapa.
4. (Opcional) B3 advecção, lightning se surgir fonte oficial.

## Honestidade

- Cone NHC é incerteza oficial — renderizar como cone, nunca como linha certa.
- ETA advectivo → etiqueta «estimativa»; estado «limpo» ≠ sem risco.
- Radar degradado → «dados indisponíveis», nunca «tudo limpo»
  (monitor `ipma-radar-outage` já existe).
- Sem tempestade activa no rectângulo → camada mostra «nenhuma», não
  inventa eco.
