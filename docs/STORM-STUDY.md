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
| Atlântico até Açores | **NHC cone/track** (ciclones) + **Satélite IR 10 min** — MTG-I1 primário, GOES-East fallback (nuvens/células) |
| Madeira / Canárias / Norte de África | IPMA/MET avisos + Satélite IR + NHC quando aplicável |

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

### B. Satélite — MTG-I1 primário (EUMETSAT), GOES-East/GIBS fallback ✅

- **Primário (2026-10):** `scripts/fetch-mtg-ir.py` — Meteosat MTG-I1 FCI
  via EUMETSAT Data Tailor (ROI Ibéria+Atlântico 28–52°N, 34°W–1°E, ~2 km/px).
  Produto por elevação solar: de dia `natural_color` (foto opaca), de noite
  `ir_105` → radiância→BT (Planck) → paleta topo-de-nuvem translúcida →
  WebP + `sat-mtg.json`. Meteosat a 0° dá PT na resolução nativa ~2 km —
  resolve o caveat do limbo GOES abaixo. Licença: frames ≥1 h = «Core»
  CC-BY-4.0.
- **Fallback:** GIBS `GOES-East_ABI_Band13_Clean_Infrared` (mesmo
  carrossel; entra quando `sat-mtg.json` está ausente ou >3 h stale).

- Detalhe do fallback GIBS: camada
  `GOES-East_ABI_Band13_Clean_Infrared`, **cadência PT10M** no capabilities,
  tile real servido (PNG ~70 KB, `GoogleMapsCompatible_Level6`).
- Tops de nuvens frias = células de tempestade a formar-se no Atlântico —
  o «a aproximar-se» visível ~1000 km antes da costa.
- Mesma infra GIBS WMTS — muda o layer id, o tile matrix `Level6`
  (~1,2 km/px, aceitável p/ nuvens) e o slot TIME com timestamp a 10 min.
  *(A antiga camada GIBS true-color/MODIS que aqui servia de referência
  foi removida na Fase 3 — ficou só esta IR.)*
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

**Estado: implementado** — `scripts/lib/nhcStorms.js` (unzip KMZ manual com
`zlib`, parse KML, scope, `spotStorms` por cone) + `fetch-nhc-storms.js` →
`public/data/storms.json` + `src/lib/nhcStorms.ts` (loader cached,
`stormsForSpot`, `stormsFresh` 24 h) + camada Leaflet «Tempestades
tropicais» no grupo TEMPO (cone tracejado translúcido, track + pontos
datados, centro com pulse CSS só em `no-preference`) + `SpotStormAlert` no
spot page («No local», antes dos avisos IPMA/IH) + i18n ×5 + budget 0.2 MB
+ passo `continue-on-error` no workflow + `storms:fetch` no `data:update`.
Rectângulo usado: 25–50 N, -48→-4 E + margem 8° no centro (Cabo Verde).

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

**Estado: implementado** — `scripts/lib/stormState.js` (eco por spot: mask
alpha+máscara preta, distância ao eco mais próximo ≤60 km, intensidade por
paleta azul→verde→amarelo→magenta, centróide 150 km + vector de deslocamento
entre o último frame e o de ~15 min → «a aproximar-se» medido) +
`build-storm-state.js` → `storm-state.json` (~50 KB: radar + warnLevel +
inStormCone por spot) + `src/lib/stormState.ts` (loader + `radarStateFresh`
75 min — o pipeline corre 2×/h) + `SpotRadarEcho` no bloco «No local»
(linha compacta «Chuva sobre o spot agora» / «Precipitação a ~X km (W)»
+ intensidade · aproximação · hora do frame) + i18n ×5 + budget 0.1 MB.
Ilhas = `radar: null` (fora das bounds IPMA — honesto).

- PNG do radar mais recente → eco a ≤X km → `{ limpo | perto | sobre, distKm }`.
- Centróide do eco em 2–3 frames → vector «a aproximar-se de W ~25 km/h».
- Nível IPMA do distrito + NHC cone → estado composto por spot.
- Artefacto `storm-state.json` → badge spot + contexto mapa.
- Verificar decoder de imagem (`sharp` — já nas deps para OG images?).

### B2 — Polígonos de aviso no mapa

**Estado: implementado** — `public/geo/warning-areas.json` (bake ocasional
`npm run warnings:areas`, commitado — fronteiras quase não mudam). Fontes:
distritos do continente via **DGT OGC API** `collections/distritos`
(CAOP2025, oficial — a OGC só publica o continente) + ilhas via
OpenStreetMap/Nominatim (`scripts/fetch-warning-areas.js`, 1 req/s).
`scripts/lib/warningAreas.js`: mapeamento área→grupo (18 distritos →
código IPMA; Madeira = ilha inteira para MCN/MCS/MRM; Açores = ilhas
agrupadas em AOR/ACE/AOC), Douglas–Peucker + arredondamento 4 dp
(~40 KB, 23 grupos). Camada opt-in «Áreas de aviso IPMA» (grupo Tempo,
`data-map-warn-areas-toggle`, LS `ventu.map-warn-areas`): polígono
tracejado translúcido na cor do nível máximo (amarelo/laranja/vermelho)
com tooltip «área + avisos activos · nível · até»; **só pinta grupos com
aviso em vigor ou anunciado** (`endTime` passado não pinta) — sem avisos
activos o toggle desactiva-se. Reusa `warnings.json` via `useIpmaWarnings`
(cache partilhado com os badges dos pins).

- CAP MeteoAlarm (key) fica como upgrade futuro para geometrias
  sub-distritais; o nível distrito/ilha do IPMA já é o que o aviso cobre.
- Cor por nível; sem pulsação — o tracejado + cor já lêem bem.

### B4 — Alertas de aviso para o utilizador

**Estado: implementado** — `scripts/lib/alertWarnTriggers.js` (triggers por
spot: IPMA laranja/vermelho em `spotWarnings`, faixa §0 do IH via
`coverage` — port dos regex de `navWarningSafety.ts`, cone NHC em
`spotStorms`) + `warn` opt-in em `user_alert_prefs`
(`supabase/supabase-alerts-warn.sql`: coluna + RPC
`subscribe_favorites_alerts` 5-arg com rate-limit per-IP intacto) +
`warned[]` no evaluator — email/Telegram dispara sem nenhum score firing,
respeitando digest/imediato/cooldown existentes; UI: checkbox no
`FavoritesAlertsPanel` ×5 locales. Amarelos IPMA e avisos de sinalização
não disparam (ruído). Sem a coluna `warn` → `pref.warn === true` nunca e
o comportamento E1c fica intacto (migration opcional, degrada limpo).

- Gatilho independente do score: favorito com IPMA ≥ laranja, IH §0, ou
  **cone NHC a tocar o spot** → email/Telegram.
- Flag `warn` em `user_alert_prefs` + path no evaluator + template ×5 locales.
- Reusa tokens/confirm/unsubscribe/cooldowns existentes.

### B5 — Satélite animado (fonte B)

**Estado: implementado — primário MTG-I1, fallback GIBS.** Pipeline
`scripts/fetch-mtg-ir.py` (FCI vis/ir → `sat-mtg.json` + WebPs) alimenta
`L.imageOverlay`s; `src/lib/goesIr.ts` fica como fallback (camada
`GOES-East_ABI_Band13_Clean_Infrared`, `GoogleMapsCompatible_Level6`,
PT10M; carrossel de 12 slots a terminar ~45 min atrás — latência real do
produto medida no capabilities) + tileLayer num pane próprio (206, logo
acima do hillshade) + `RadarCarousel` generalizado
(`cadenceMin`/`icon`/`attribution`/`staleMaxAgeMin`/relógio Lisbon-TZ) +
item «Satélite IR (10 min)» no grupo TEMPO (menu desktop + sheet,
`data-map-goes-ir-toggle`) + 5.ª key no cap de raster pesadas +
prefs `ventu.goes-ir.state`. Badge com hora de Lisboa, gaps e «atrasado»
>2 h; tiles sem publicar simplesmente não pintam — nunca inventados.

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
