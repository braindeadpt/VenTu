# VenTu — Context for LLM sessions

Lê este ficheiro antes de qualquer trabalho no repo. Define o estado do projecto e as restrições técnicas que limitam que soluções são viáveis.

> **Prioridades de trabalho:** [`ROADMAP.md`](./ROADMAP.md) — Fase **E** / **C4b** (calibração scores com feedback)

Última actualização: 2026-08-13 (S7: headers HTTP reais via Cloudflare proxy — [`SECURITY-HEADERS.md`](./SECURITY-HEADERS.md)).

## Identidade

- **Projecto:** VenTu — plataforma open-source de condições para desportos náuticos em Portugal (surf, kitesurf, windsurf, bodyboard, SUP, foil, wakeboard).
- **Repo:** https://github.com/braindeadpt/ventu
- **Site em produção:** https://ventu.surf/pt/
- **Licença:** MIT.

## Stack técnica

| Camada | Tecnologia | Notas |
|---|---|---|
| Framework | Next.js 16 + React 18.3 | App Router, static export |
| Linguagem | TypeScript 5.4 (strict) | |
| Styling | Tailwind CSS 3.4 | Config em `tailwind.config.ts` |
| Ícones | `lucide-react` | Não trocar por outra lib |
| Mapas | Leaflet + MarkerCluster | SpotMap, cluster na homepage |
| Dados marinha | Open-Meteo Marine API | Free, sem auth, `wind_speed_unit=ms` |
| Marés (observado) | IH OGC API (hidrografico.pt) | Free, CC-BY 4.0, 33 estações |
| Chat | Removido | UI removida 2026-05-21 |
| IA notícias / Dawn Patrol | Gemini Flash + Groq Llama 3.3 + Cerebras | GitHub Actions (secrets no repo remoto) |
| Previsões | Open-Meteo + `forecasts.json` precomputed | CI a cada 3h; client JSON first, live API fallback |
| Testes | Vitest (unit) + Playwright (E2E) | `npm test` + `npm run test:e2e` |
| Deploy | GitHub Pages (static export) | `output: 'export'` no `next.config.js` |

> **Citação Open-Meteo (obrigatória, pedida na página de licença):** Zippenfenig, P. (2023).
> *Open-Meteo.com Weather API* [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.7970649 —
> reproduzida na página About e na página de fontes (`/fontes`).

## Restrições técnicas críticas

1. **Static export.** Sem API routes em runtime, sem middleware. Tudo é HTML/JS/CSS estático.
2. **Sem headers HTTP customizáveis** no GitHub Pages (CSP só via meta, limitado). Decisão S7: proxy Cloudflare + Transform Rules à frente do `ventu.surf` → [`SECURITY-HEADERS.md`](./SECURITY-HEADERS.md).
3. **Deps leves.** Justificar novas dependências antes de adicionar.
4. **Rotas dinâmicas exigem `generateStaticParams`.** Não introduzir rotas não enumeráveis.
5. **Server components correm em build time**, não em runtime.
6. **Homepage:** não usar `searchParams` async no server — quebra static export. Filtros sport/region via client + `?sport=` / `?region=` (`gridFilters.ts`).

## Copy e confiança (Fase A — concluída)

- **Nunca** “tempo real” / “real-time”. Cadência honesta: *actualizado a cada 3 horas*.
- **`DataSourceBadge`** (`src/components/ui/DataSourceBadge.tsx`) — DEMO / stale / cached em SpotDetail, Compare, Favoritos, SpotDrawer, grid.
- **Dawn Patrol:** `public/data/dawn-patrol.json` + guard stale (>24h) e validação de slugs no banner.
- **Stale threshold:** >3h amarelo, >12h vermelho (`src/lib/dataFreshness.ts`).

## Scoring multi-desporto

| Ficheiro | Função |
|---|---|
| `src/lib/sportScore.ts` | Scores 0–100 por modalidade, `getHourlyScores`, `getRelevantSports` |
| `src/lib/sportRatings.ts` | `SportType`, `getCompatibleSports`, `TYPE_TO_SPORTS` fallback |
| `src/lib/homepageSport.ts` | Sort/ticker/hero por modalidade preferida (`ventu-preferred-sport`) |
| `src/lib/gridFilters.ts` | Sync URL ↔ filtros do grid |

**Testes:** `src/lib/__tests__/sportScore.test.ts` (20+ casos). Correr `npm test`.

**`compatibleSports`:** 185/185 explícitos. Validação CI: `npm run spots:validate` (`scripts/validate-spots.js`).

## Maré (Instituto Hidrográfico)

```
scripts/fetch-ih-tides.js → public/data/ih-tides.json
scripts/update-conditions.js → conditions.json (tide fields)
SpotDetailClient + ForecastTable (row condicional)
```

- 33 estações IH · maioria dos spots continentais mapeados
- Dados observados (não previsão horária IH); previsão MSL via Open-Meteo

## Boias Datawell (IH) — onda observada

```
scripts/fetch-ih-buoys.js → public/data/ih-buoys.json
scripts/lib/ihBuoys.js → parse, mapping spot→boia, frescura 3h
scripts/fetch-ih-isobaths.js → public/data/spot-isobaths.json (depcnt_8_16_30, sem key)
scripts/lib/ihIsobaths.js → distância da praia às isóbatas 8/16/30 m (CC-BY 4.0)
scripts/fetch-ih-coastal-warnings.js → public/data/ih-coastal-warnings.json (nav_warning_coastal, sem key)
scripts/lib/ihCoastalWarnings.js → avisos à navegação costeiros por spot (point-in-polygon, CC-BY 4.0)
# Cross-border ES: o fetch aceita ES_NAV_WARNINGS_URL (GeoJSON, shape do IH). Fallback
# de TEXTO (NAVAREA III em vigor / NAVTEX / METAREA II) — ver docs/ES_NAV_WARNINGS.md.
scripts/merge-observations.mjs → conditions.json[spot].observedWave
scripts/test-ih-api-key.js → teste de ponta a ponta da key (`npm run buoys:test-key`)
```

- Estações via OGC API (grátis, sem key) — duas colecções: `buoys_datawell` (Datawell Waverider:
  Leixões 6201077, Sines 6201078, Faro 6201079, Funchal/Caniçal, Açores) e
  `buoys_Fugro_oceanor_wavescan` (Fugro Oceanor Wavescan: **Nazaré Costeira CSA88/2 activa**, WMO 6200199)
- Séries de onda (hm0/tp/thtp) com `IH_API_KEY` (grátis), keyed por `id_est` independentemente da família
  (o schema Fugro usa `last_data` em vez de `last_sea` — o `normalizeStation` aceita ambos)
- Obter a key + criar o secret GitHub + teste e2e: [`IH_API_KEY.md`](./IH_API_KEY.md)
- Sem key: estações sim, `observedWave` não (degradação graciosa, nunca bloqueia a pipeline)
- A colecção Fugro dá à costa centro (Nazaré→Guincho, ~36 spots) uma boia a ~15–30 km em vez de
  Sines/Leixões a centenas de km

## Boias WMO (Copernicus Marine S3) — fallback cross-border da onda observada

```
scripts/fetch-copernicus-buoys.js → public/data/wmo-buoys.json
scripts/lib/copernicusBuoys.js → S3 listing, NetCDF-4 (h5wasm), extração à superfície, frescura 6h
scripts/merge-observations.mjs → fallback do observedWave (IH primário, WMO secundário)
```

- **Sem key** (bucket público `mdl-native-01`) — rota independente da API do IH (WMO/GTS)
- Cataloga Datawell PT (6201077 ao largo do Porto, 6201079 ao largo de Faro) + Puertos del Estado ES
  (6200024 Bilbao, 6200025 Cabo Peñas, 6200083 Villano-Sisargas, 6200084 Cabo Silleiro, 6200085 Golfo
  de Cádiz) — as espanholas voltaram a reportar à Copernicus em 2026-08 (hourly, `IR_TS_MO_*`)
- Merge: `observedWave` usa a boia IH quando fresca (3h); senão a WMO fresca (6h, para absorver o lag
  de ingestão da Copernicus) com `source: 'wmo-buoy'`; UI: rótulo honesto «boia Cabo Silleiro a 56 km»
- Açores/boias mortas nunca produzem dados — só boias com leitura fresca no ficheiro do dia são mapeadas

### Coerência cross-border (validação)

```
scripts/check-buoy-coherence.js → public/data/buoy-coherence.json (npm run obs:coherence)
scripts/lib/buoyCoherence.js → alinhamento por hora UTC + stats + veredicto (puro)
```

- Compara as boias ES (6200084 Cabo Silleiro, 6200083 Villano-Sisargas) com as PT (6201077 Porto,
  6201079 Faro) nas horas sobrepostas (PT reporta a horas esparsas — bucketing à hora UTC; ES é horária)
- **Acumulação dia a dia:** os pares horários ES×PT arquivam-se em `buoy-coherence-archive.json` (padrão
  forecast-skill — dedup por par+hora UTC, janela de 30 dias); os veredictos do relatório vêm da janela
  acumulada, por isso o n é suficiente mesmo com as boias PT esparsas (1 run isolado quase nunca tem n ≥ 3)
- Por par: n, mean|Δhs|, ME, max|Δ|, r (Pearson) e veredicto — coherent (mean|Δ| ≤ 0.8 m), review,
  incoherent (≥ 1.5 m, n ≥ 3) ou insufficient. Overall incoherent → aviso do validador
- **Auditoria por região (`regions`, escrita pelo merge-observations pós-merge):** por região, contagens
  por fonte anexada (IH/WMO) e `attachedIsClosest`/`attachedNotClosest` vs a boia alternativa — os spots
  onde a fonte anexada NÃO é a mais próxima ficam em `notClosest` (spot, vencedor, razão, km de ambas).
  O validador avisa quando uma região tem `attachedNotClosest > 0`. Sem observedWave a região fica com
  cobertura zero (audit honesto).
- **Gate no merge:** se um par ES×PT do dia estiver `incoherent`, o merge-observations **recusa anexar
  essa boia espanhola aos spots PT** (o observedWave cai para IH-only ou fica sem leitura; log
  «WMO recusada por coerência» + contagem de spots). Mesmo `incoherentEsCodes` do gate do wave-bias;
  as boias PT nacionais (Porto/Faro) nunca são bloqueadas.
- **Calibração cross-border (merge):** quando uma boia ES vence (WMO-only) num spot PT, o merge recalibra
  a altura para a referência PT — `calibrated = raw + ME` do par ES×PT do `buoy-coherence.json`
  (referência = boia PT mais próxima do spot; n ≥ 3 e veredicto não-incoherent; clamp ≥ 0.1 m). O payload
  ganha `calibration: { me, n, from, rawHeight, deltaM }` e a UI mostra a correcção de forma transparente
  («medido 2.3 m → 1.4 m · viés -0.9 m (n=4)» no card + nota no tooltip do badge do score) — a leitura
  espanhola é um proxy, não a onda local, e o ajuste nunca fica escondido. Ex.: Silleiro×Faro ME −0.9 m
  (revisão, n=4) → a leitura do Silleiro baixa ~0.9 m ao ser anexada a spots do Algarve.
- Valida que o observedWave anexado a spots do NW PT por uma boia espanhola não está a ler outra onda

## Skill/bias de onda (Open-Meteo vs boias)

```
scripts/fetch-wave-bias.js → public/data/wave-bias.json (ME/MAE/RMSE/r por boia e região)
scripts/lib/buoyBias.js → alinhamento horário, métricas, agregação por região, correcção
scripts/lib/wmoBiasArchive.js → arquivo de leituras das boias ES (acumula run a run)
update-conditions.js → waveHeight corrigido + waveHeightRaw + waveBias (opt-in)
```

- **Duas plataformas de observação:** (1) boias IH Datawell (getDatawellData, precisa de IH_API_KEY);
  (2) boias ES da Copernicus via WMO **sem key** — Cabo Silleiro/Villano (Galiza), Bilbao/Cabo Peñas
  (Cantábrico) e Golfo de Cádiz. As leituras ES acumulam em `wmo-bias-archive.json` (o bucket público
  só guarda `latest/<dia>`; dedup por hora UTC, janela de 13 dias) até N≥30
- Compara ERA5 (Open-Meteo Historical Marine) com hm0 das boias, janela de 13 dias, pares por hora UTC
- Atribuição por região: mapa geográfico spot→boia ES mais próxima (estável, não depende de frescura) —
  Cabo Silleiro → Caminha/Viana/Esposende/Porto/…; Golfo de Cádiz → Alentejo/Algarve; o viés ES entra no
  wave-bias.json mesmo **sem IH_API_KEY** (source: 'wmo-es' por boia)
- **Gate cross-border (coerência):** o fetch-wave-bias lê o `buoy-coherence.json` (passo anterior no workflow).
  Se um par ES×PT estiver `incoherent` (mean|Δ| ≥ 1.5 m), o bias dessa boia ES fica no relatório mas é marcado
  `regionAttribution: false` e **não é atribuído a regiões** (bloco `coherenceGate.gatedCodes` no wave-bias.json) —
  a boia pode estar a ler outra onda; `review`/`insufficient` não bloqueiam.
- Correcção regional **opt-in**: `VENTU_WAVE_BIAS_CORRECTION=1` (GitHub Actions → Variables), guardas N≥30 e |ME|≥0.15 m, clamp ≥0.1 m
- **Caveat:** `past_days` da API de previsão devolve o mesmo backfill ERA5 — não há previsões arquivadas; mede-se viés do modelo (não skill real do forecast). Validar contra o card de onda observada antes de ligar em produção

## Wind bias por estação (observado vs previsão, arquivo run a run)

```
scripts/lib/windBiasArchive.js → public/data/wind-bias.json (acumula no merge-observations)
scripts/merge-observations.mjs → conditions.json[spot].windBias (ME/MAE/RMSE/n da estação)
src/components/ui/ScoreWindSourceBadge.tsx → tooltip «Viés desta estação: ME +x kt (n=…)»
```

- **Transparência do vento observado:** quando o score usa vento medido (IPMA/Ecowitt/METAR
  fresco), o badge «Vento observado» mostra no tooltip o viés da estação — ME/MAE/RMSE/n em kt,
  acumulado run a run pelo merge (mesma filosofia do forecast-skill: n só com repetição).
- O merge emparelha, em cada run, a previsão da row (`windSpeed` m/s → kt) com o `windSpeedKt`
  da estação que serve o spot (dedup por estação+spot+hora UTC, janela de 30 dias). Só pares
  com leitura fresca (≤3 h — o mesmo gate que o score usa). ME = média(observado − previsão):
  positivo = o modelo subestima o vento nessa estação.
- Apenas estações com **n ≥ 10** entram no report (`stations`); a row só ganha `windBias` quando
  a estação do spot está nesse conjunto. Sem observações frescas o arquivo não é escrito (o
  validador avisa da ausência). Sem custo extra de quota — reutiliza o observed do merge.

## Forecast skill real (best_match vs boias IH, arquivo run a run)

```
scripts/fetch-forecast-skill.js → public/data/forecast-skill.json
scripts/lib/forecastSkill.js → hora Lisboa, arquivo, cruzamento com lead, ME/MAE/RMSE/r
```

- **Distinto do wave-bias (ERA5):** aqui mede-se skill REAL — a previsão best_match feita no run N para a hora H (guardada com `runAt`) é comparada com a leitura da boia para H quando esta chega. Par só com **lead time > 0** (a previsão foi feita antes da hora) — nunca nowcasting.
- Cada run full arquiva as previsões futuras (48 h, spot mais próximo de cada boia activa) e as observações recentes da boia (48 h, `getDatawellData`, precisa de `IH_API_KEY`). Janela do arquivo: 30 dias; stats reportados com N≥10.
- **Boias ES (Copernicus WMO, sem key):** o mesmo arquivo ingere as leituras acumuladas do `wmo-bias-archive.json` (escrito pelo fetch-wave-bias, passo anterior no workflow) como observações e arquiva o best_match dos spots mais próximos de cada boia ES (Silleiro/Villano → NW, Cádiz → Algarve/Vicentina, Bilbao/Peñas sem spots PT). `buoyId` = código WMO string (sem colisão com o idEst numérico do IH) → **pares ES formam-se mesmo sem `IH_API_KEY`**. O merge anexa o skill ES (ME/n) às leituras WMO do observedWave (badge «corrigido pela boia»).
- Horas alinhadas em **Europe/Lisbon** (base nativa do forecasts.json); `hourKeyToUtcMs` resolve DST para o lead time.
- Sem key IH: os pares ES continuam a acumular (as leituras WMO não dependem de key); falha → mantém o anterior, exit 0.
- npm `skill:fetch`; corre no workflow depois do wave-bias (modo full, precisa do arquivo WMO). O `wave-bias.json` continua a ser o que alimenta a correcção regional; este é o observatório de skill ao longo do tempo.

## Regressão do forecast-skill (health-check por boia)

```
scripts/check-skill-regression.js → public/data/skill-regression.json + skill-regression-archive.json (npm run skill:regression)
scripts/lib/skillRegression.js → snapshots diários, janelas recente/baseline, limiares, notificação (puro)
```

- O health-check (modo full, depois do fetch-forecast-skill) arquiva um **snapshot diário** por boia
  (byBuoy do forecast-skill.json, n≥10) e compara a janela **recente (7 dias)** com a **baseline
  (21 dias anteriores)** — o skill é uma janela de 30 dias recomputada a cada run, por isso a
  comparação recente-vs-baseline detecta REGRESSÃO (o modelo piorou naquela boia), não ruído de 1 dia.
- **Cobre as duas plataformas de `byBuoy`:** numérica IH idEst e **string WMO-ES** (ex. 6200084
  Cabo Silleiro, da rota keyless Copernicus) — o `origin` ('ih' | 'wmo-es') é preservado no snapshot
  e no report, por isso uma regressão do **NW dispara o aviso sem depender da `IH_API_KEY`** (o
  snapshot archive ambas e o operador vê «WMO-ES (keyless)» no log/Telegram).
- Regressão: RMSE recente ≥ baseline + **0.3 m** OU |ME| recente ≥ baseline + **0.3 m** (limiares
  configuráveis na lib; exige ≥2 snapshots recentes e ≥3 de baseline). Report `skill-regression.json`
  com `byBuoy` (verdict ok/regressed/insufficient) + `regressions` (deltas, razões e `origin`); o validador avisa.
- **Health por PLATAFORMA (não só per-boia nem total misto):** além da regressão por boia, o
  mesmo report expõe `platforms` (agrega as boias de **IH** vs **WMO-ES** por dia: n = soma das
  boias, ME ponderado por n) e `platformAlerts` (um aviso por plataforma), para apanhar degradações
  **difusas** que o per-boia perde (ex: todas as boias piorarem 0.25 m — nenhuma salta o limiar,
  mas a plataforma sim) e **quebras de fluxo** (IH_API_KEY expirada, Copernicus a deixar de publicar).
  Verdict da plataforma: `n-collapse` (n diário recente < baseline × **0.5**, com baseline ≥10/dia)
  é mais grave que `me-worsened` (|ME| ≥ baseline + **0.3 m**); ambos listados em `reasons`.
- Notificação Telegram (`OPS_TELEGRAM_CHAT_ID` + `TELEGRAM_BOT_TOKEN`) só na **transição** para
  regressed (uma vez por boia) E na transição de um alerta de plataforma (uma vez por estado,
  `platform:verdict`) — padrão do model-health. Report/arquivo gitignored — nunca bloqueia
  o deploy; sem forecast-skill.json degrada graciosamente (exit 0).

## Exposição do forecast-skill (UI)

- **Página de spot:** o `ObservedWaveCard` mostra a linha «Skill desta boia» (ME/MAE/RMSE/r/lead, n) quando a leitura está fresca; **sem leitura fresca**, uma linha discreta `BuoySkillLine` (mesmo rótulo, `data-buoy-skill-line`) aparece na secção de verificação, resolvida em runtime a partir do `forecast-skill.json` + mapeamento spot→boia (`ih-buoys.json` idEst, fallback `wmo-buoys.json` code) via `src/lib/forecastSkill.ts` (client, cache por sessão; falha → silencioso).
- **About:** secção «Skill real do forecast por boia» (tabela n/ME/MAE/RMSE/r/lead médio) ao lado da calibração — lida em build time (`loadForecastSkillBuoys`, padrão waveBias.ts); esconde-se sem dados (n≥10 por boia, mesmo gate do produtor).
- Distinção honesta mantida: o About explica que isto é skill REAL do forecast (lead>0), diferente do viés ERA5 da secção de calibração.

## Segurança HTTP — headers reais (S7)

- GitHub Pages não permite headers custom; hoje só CSP via meta (`CSPMeta.tsx`) — `frame-ancestors` em meta é ignorado pelos browsers (sem anti-clickjacking real).
- **Decisão tomada:** proxy Cloudflare (DNS proxied) + **Response Header Transform Rules** a espelhar o `public/_headers`, com o override `/embed/*` a manter o widget B2B iframeable (`frame-ancestors *`, sem `X-Frame-Options`). Remove também o `Access-Control-Allow-Origin: *` do GitHub Pages.
- CSP do header = espelho do `CSP_META`; a meta permanece como fallback (header + meta idênticos = intersecção sem conflito).
- **Ação manual pendente (dashboard Cloudflare):** DNS + 2 regras → passos e valores exactos em [`SECURITY-HEADERS.md`](./SECURITY-HEADERS.md).

## Estrutura do repo (resumo)

```
src/
├── app/[locale]/          Home, spots, favorites, compare, news, about, modalidades, sazonalidade
├── components/            UI, spots, weather, layout, DawnPatrolBanner, DataSourceBadge
├── lib/                   spots.ts (185), sportScore, openmeteo, i18n, homepageSport, gridFilters
└── types/

public/data/               conditions.json, forecasts.json, news.json, dawn-patrol.json, ih-tides.json, ih-buoys.json, spot-isobaths.json, ih-coastal-warnings.json, wmo-buoys.json, warnings.json, radar.json, radar/ipma-radar.png, radar/frames/*.png, model-health.json, map-hours.json

## Avisos IPMA / MeteoAlarm — UI

- `warnings.json` (fetch-ipma-warnings.js, com fallback automático para MeteoAlarm) → secção na página de spot + linha no Dawn Patrol
- **Fonte primária IPMA** (open data, sem key). Se a API do IPMA falhar, o script cai para o
  **MeteoAlarm (EUMETNET)** — particulares via MeteoGate (`METEOGATE_API_KEY`,
  `api.meteogate.eu/warnings`); EDR directo (`METEOALARM_API_KEY`) só para redistribuidores
  (ver docs/METEOALARM_API_KEY.md),
  API OGC EDR + CAP Oasis 1.2, normalizado para o mesmo shape com `source: 'ipma' | 'meteoalarm'`
  no payload; o rótulo da fonte na UI (secção de spot + Dawn Patrol) reflecte o fallback.
- `ih-coastal-warnings.json` (fetch-ih-coastal-warnings.js, OGC API do IH sem key) → **Avisos à
  Navegação Costeiros** em vigor com cobertura por polígono (point-in-polygon, ray casting) — a
  secção de avisos do spot mostra os que realmente o cobrem (exercícios, perigos, restrições),
  como camada de segurança marítima complementar ao IPMA/MeteoAlarm; renderiza só quando o spot
  está coberto (nunca a secção vazia).

## Score recalibrado por boia no Dawn Patrol e nos alertas

- `scripts/lib/dawnPatrolScore.js` (puro) recalibra o score matinal do Dawn Patrol com a
  camada de boias: **leitura fresca** do `conditions.json` (IH ≤3h, WMO ≤6h) → `source: 'boia'`;
  senão o **viés regional da row** (`waveBias` meta da pipeline, gates n≥30 e |ME|∈[0.15,1.5]) →
  `source: 'viés regional'`; senão `previsão` (sem correcção). O `dawn-patrol.json` passa a
  incluir por spot `score` (recalibrado), `scoreForecast`, `scoreSource` e `scoreMeta` — o banner
  mostra o score corrigido com tooltip da origem.
- `scripts/lib/scoreSpotConditions.js` → `computeScore` devolve `{ score, source }` (mesma
  resolução da UI via `resolveScoreWaveSource`); `evaluate-alerts.js` anexa a nota
  «(corrigido pela boia)» / «(viés regional)» ao score nos emails e no Telegram do resumo.

## Orçamento Open-Meteo (quota 10k/dia)

- Cada **modelo pedido conta como 1 chamada** ponderada (confirmado na issue
  open-meteo/open-meteo#464 e FAQ de pricing). Ensemble actual (4 ondas + 4 vento
  + 2 best_match) ≈ **10 ponderadas/spot** → run dia ≈ **1 810**; best_match ≈ 362.
- Todos os runs de dia a 2h com multi-modelo gastariam **15–17k/dia (50–70%
  acima do limite)** — por isso o multi-modelo é limitado às **âncoras 06h, 12h,
  18h** (override: `VENTU_MULTIMODEL_HOURS="6,10,14,18"`); os restantes runs de
  dia (e o extra 17h abr–out, e a noite 00h/04h) são best_match, herdando a
  confiança do último run multi-modelo (≤6h). Frescura mantida (full run de 2h
  em 2h — nunca ultrapassa o stale de 2.5h).
- Orçamento resultante: **inverno ~7 964 (80%) · verão ~8 326 (83%)** — folga
  para retries/catch-up. Ver updateSchedule.js + dataPipelineAudit.js.
- **Uso real por run:** o `update-conditions.js` conta as **chamadas ponderadas** de facto
  (Σ modelos × pedidos HTTP, retries incluídos) e regista no log (`📊 Open-Meteo usage (real): …`)
  + `openMeteoUsage` no `pipeline-meta.json` (`weightedCalls`, `requests`, `retries`,
  `spotsFetched`, `mode`, `weightedPerSpot`) — comparar com o orçamento acima para
  detectar desvios (spot novo, retries a mais, modelo adicionado).
- Trade-off honesto: entre âncoras, o windBlend (ICON-EU+mediana) não é
  recalculado — scores usam best_match e o badge de confiança fica degradado.

## Health-check de modelos (Open-Meteo ensemble)

- `model-health.json` + aviso no log: detecção de **modelos mortos** (devolvem só
  null) no ensemble — ex.: o antigo `ecmwf_wam025` (removido por isso).
- O `update-conditions.js` acumula contagens não-null por modelo configurado
  (`WAVE_MODELS`/`WIND_MODELS` em lib/forecastConfidence.js) em cada run
  multi-modelo (zero chamadas extra) e escreve o report; `models:health`
  (scripts/check-model-health.js) é o probe on-demand de 1 spot (exit 1 se
  houver modelo morto).
- Notificação: Telegram para `OPS_TELEGRAM_CHAT_ID` (opt-in) só na **transição**
  para morto (não spamma todos os runs). Ver lib/modelHealth.js.

## Health-check unificado das camadas de dados

- `scripts/check-data-layer-health.js` (UM passo no workflow, substitui o antigo
  `check-buoy-layer-health.js`) lê o `pipeline-meta.json` e avisa/falha quando
  QUALQUER camada opcional está degradada por **várias runs consecutivas**. Cada
  run grava o streak (runs seguidas em `down`/`stale`; 0 em `ok`; boias `no-key`
  nunca conta) nas chaves `buoyLayer` (boias IH/WMO), `radarLayer` (radar IPMA:
  ok se o frame mais recente ≤25 min), `warningsLayer` (avisos IPMA/MeteoAlarm:
  ok se `fetchedAt` ≤24 h — um warnings.json vazio mas fresco é ok) e
  `coastalWarningsLayer` (avisos à navegação costeiros IH: ok se `fetchedAt`
  ≤24 h).
- **Fonte ES cross-border (Avisos a los navegantes):** o fetch costeiro grava
  `esHealth` (configured/disabled + status ok|error + timestamps) no
  `ih-coastal-warnings.json` e o `esSourceNote` marca degradação quando o feed
  falha; os writers propagam-no ao meta como `coastalWarningsLayer.es` com o seu
  próprio streak (`applyCoastalEsStreak`). O health-check avisa quando
  `ES_NAV_WARNINGS_URL` está configurada mas o feed devolve erros repetidos:
  streak ES ≥ `FAIL_AFTER` → `::error::` + exit 1, ≥ `WARN_AFTER` → `::warning::`
  (um erro isolado não falha o CI). Ver docs/ES_NAV_WARNINGS.md para o contexto
  da fonte.
- `check-data-layer-health.js` − streak ≥ `FAIL_AFTER` (6) → `::error::` + exit 1;
  ≥ `WARN_AFTER` (3) → `::warning::` + exit 0. Limiares globais env-overridable
  (`DATA_LAYER_WARN_AFTER`/`DATA_LAYER_FAIL_AFTER`); pure `evaluateDataLayerHealth`
  em lib/dataLayerHealth.js (testável). `obs:update`/`update-conditions` geram os
  streaks via `applyLayerStreak` (genérico) / `buildCoastalWarningsLayer` a
  partir dos ficheiros já fetchados.

## Radar IPMA — overlay no mapa

- `radar.json` + `radar/ipma-radar.png` + `radar/frames/*.png` (fetch-ipma-radar.js) →
  camada opcional no mapa (toggle) sobreposta com `L.imageOverlay` (opacity 0.8).
  O manifest bake os **12 frames mais recentes** (última hora, 5-min cadence) e o mapa
  anima-os como carrossel (`overlay.setUrl`, 1 frame/s) com badge de hora + progresso
  (ex.: «Radar 00:55 · 2/12») em `data-radar-badge`; `radar/ipma-radar.png` é o frame
  mais recente (compat com o layout antigo de frame único).
- O IPMA **não tem WMTS/tiles públicos** (sig.ipma.pt/geoserver mortos). O que é estável:
  manifest `resources.www/transf/radar/imgs-radar.json` (frames PNG de 5 em 5 min,
  `pcr-*.png`, com alpha — só os ecos) e os **bounds oficiais** do overlay Leaflet do
  próprio IPMA (mapbuilder-pt.js): SW (34.011513, -12.454795) → NE (43.792862, -4.345465).
  Bake do frame mais recente para o nosso origin (sem CORS/hotlink); falha → camada off.
- **Hs no mar + correntes:** `map-hours.json` (build-map-hours.js, no fim de update-conditions)
  leva `hs` (m) e `currents` `{spd, dir}` por spot nos mesmos 16 passos de 3 h. O mapa interpola
  IDW entre spots (campo raster, pane 350/360, abaixo do radar). Correntes = Open-Meteo SMOC
  (~8 km, m/s, setas para onde a água vai); toggle `?currents=1` / `ventu.map.currents`. Não
  substitui almanaque náutico — resolução costeira limitada.
- **Badge de aviso** (Agitação Marítima/Vento, nível mais forte) no mapa (hero da homepage + /mapa)
  e nos cards da homepage (`SpotListCard`): `strongestSpotWarning` em lib/ipmaWarnings.ts,
  fetch partilhado por página em hooks/useIpmaWarnings.ts (cache module-level), chip no popup
  do marker e na bottom-sheet mobile; link para a página do spot via popup/card existente
scripts/                   update-conditions, update-news, dawn-patrol, generate-sitemap, validate-spots
tests/e2e/                 Playwright (critical-routes incl. URL filter sync)
.github/workflows/         ci.yml, deploy.yml, update-data.yml, dawn-patrol.yml, api-keys.yml (job opcional semanal: test-ih-api-key + test-meteoalarm-api-key com os secrets — falha cedo quando uma key expira)
docs/                      ROADMAP.md ← fonte de verdade para prioridades
```

## SEO

- **Sitemap:** `npm run sitemap:generate` → `public/sitemap.xml` (~2 400 URLs: 17 rotas estáticas indexáveis, modalidades, spots, news, directório; 5 hreflang pt/en/es/de/fr por URL)
- **Cobertura de rotas:** TODAS as páginas estáticas indexáveis de `src/app/[locale]/` têm de estar no sitemap (passaporte, diretorio incl. perfis `/diretorio/{slug}/`); as noindex (admin/*, conta, diretorio/gerir, auth/callback) ficam de fora de propósito — o guard do ci.yml tranca a lista
- **hreflang** pt/en/es/de/fr no sitemap e no `<head>` de cada página (via `buildPageMetadata` → `alternates.languages`)
- **JSON-LD:** `SpotDetailClient` (Beach + SportsActivityLocation), artigos news
- **Geração automática no CI/deploy antes do build** — o sitemap é um ficheiro GERADO, nunca editado à mão:
  - `deploy.yml` regenera-o antes de cada build (o sitemap publicado é sempre o do gerador);
  - `ci.yml` regenera-o e corre o **drift guard** (`scripts/check-sitemap-drift.js`): falha quando o `public/sitemap.xml` commitado diverge estruturalmente do que o gerador produz (spot/notícia novos esquecidos, hreflang em falta, prioridade alterada) — ignora `<lastmod>` (o gerador grava a data de hoje, logo um `git diff` puro falharia todos os dias);
  - `update-news.yml` regenera-o e commita-o junto com `news.json` (as URLs de notícias entram no sitemap — sem isto, o guard do ci.yml falharia no próximo push de código após qualquer actualização de notícias).

## Pipelines CI

| Workflow | Frequência | O que faz |
|---|---|---|
| `update-data.yml` | 3h | conditions + forecasts + news + IH tides |
| `dawn-patrol.yml` | Diário 05:00 UTC | dawn-patrol.json via LLM |
| `ci.yml` | PR + push main | lint, validate spots, unit tests, sitemap, build, E2E |
| `deploy.yml` | push main | test, sitemap, build, GitHub Pages |
| `evaluate-alerts.yml` | */3h + manual | email alerts (Resend + Supabase) |

### E2E core — specs do CI (e o que cada um cobre)

O `ci.yml` corre três passos Playwright: `critical-routes` (smoke de 18 rotas: homepage pt/en/es/de/fr, spot, mapa, comparador, favoritos, 404 localizados, palette de pesquisa), **`npm run test:e2e:core`** (os specs herméticos de dados/score — substituiu o antigo passo `test:e2e:data`, que era um subconjunto) e os audits `full-audit`/`visual-ux-audit`. O core agrupa os specs que correm no Actions sem rede nem `IH_API_KEY` (bloqueiam o SW e interceptam os data files client-side via `tests/e2e/helpers/conditions.ts`):

| Spec | Testes | Cobre |
|---|---|---|
| `observed-wave-card` | 46 | Onda observada: rótulo honesto «boia X a Y km», lado a lado IH vs WMO (vencedor + razão), skill ME/n por boia, ponte keyless (Cabo Silleiro), avisos de coerência ES×PT, sufixos do factor `(boia)`/`(viés regional)` e badges em pt **e** en (incl. deltaM negativo do viés e tooltip EN do bias), o trio da sticky bar (observed → nenhum → bias-corrected), comparador, ForecastTable e chip «Mar perigoso» |
| `buoy-warnings` | 18 | Aviso da camada de boias (no-key/down/stale/ok) no spot, homepage e mapa interactivo; fallback WMO cobre (sem aviso); chip de diagnóstico no ticker via `pipeline-meta.json`; chip compacto no HUD do `/mapa` ligado ao mesmo aviso (dispensa partilhada em localStorage) |
| `tides` | 5 | Marés (`TideScheduleStrip`): fase (a subir / alta agora / a descer) + próxima Baixa/Alta com HH:MM da curva real; ausência de schedule (curva sem `tideHeight`) e `MoonTideCard` |
| `home-adaptive` | 4 | Homepage adaptativa: TopNow cards, mapa hero, sufixos/avisos consistentes |
| `mapa-route` | 8 | Página `/pt/mapa` fullscreen: HUD, sheet mobile com direções/ver spot, filtros persistidos, Escape, sair sem congelar |
| `spot-dashboard` | 5 | Dashboard da página de spot: métricas, score e secções-chave |
| `confidence-badge` | 2 | Badge de confiança da previsão (multi-modelo) |
| `mar-perigoso` | 6 | Aviso de Agitação Marítima: strip no spot, Dawn Patrol, badge no card do mapa e chip na sticky bar (desktop + mobile) |
| `isobaths` | 11 | Isóbatas IH (8/16/30 m): camada no mapa, legenda de profundidade, distâncias no dashboard, deep link `?isobaths=1` |
| `topnow-wave-badge` | 9 | Badge do score de onda no TopNow (homepage): correcção (boia / viés regional, incl. deltaM negativo) vs só previsão; boia fresca ganha ao viés no mesmo row; leitura velha → nenhum badge; caminho SSG baked (wave-bias.json no build) |
| `coastal-nav-warnings` | 8 | Avisos à navegação costeiros IH + ES cross-border: secção no spot, overlay de polígonos, deep link ao detalhe |
| `data-sources` | 13 | Fontes de dados: tabela de atribuições pt/en, citação Open-Meteo (DOI) com paridade pt/en em fontes e About, cartão IH_API_KEY (+ linha de degradação da camada de boias), sitemap + hreflang, atribuições no mapa/footer |
| `coastal-map-layer` | 6 | /mapa fullscreen: overlay de polígonos de TODOS os avisos à navegação activos, popup → detalhe |
| `spot-sticky-geometry` | 2 | Geometria da SpotStickyBar: não sobrepõe os sport tabs após scroll — desktop **e** mobile (390px), cota/altura pelos tokens partilhados (globals.css) |
| `tools-calculators` | 13 | Calculadoras de kite e fato: outputs reais (m², janela confortável, espessura mm, extras), edge cases (6 kt, 45 kt, 4 °C, 24 °C, windchill), overflow horizontal em 390px e paridade pt/en |

Notas de operação:
- **Config** (`playwright.config.ts`): no CI usa `workers: 2` (runner 4 vCPU; browsers isolados por worker — medido ≈ 2m30s quando o core tinha ~115 testes) e `retries: 2` para flakes pontuais conhecidos (ex. `search palette` / sheet do mapa). Hoje o core são **143 testes em 14 ficheiros** (`npx playwright test <specs do core> --list`) — re-medir o tempo no CI se o passo apertar. O core completo (`npm run test:e2e:core`) corre como passo próprio no `ci.yml`.
- **Determinismo**: estes specs NÃO dependem da rede nem de keys — as fixtures vivem em `tests/e2e/helpers/conditions.ts` (`interceptConditions`/`interceptIhBuoys`/`interceptWmoBuoys`/`interceptWaveBias`/`interceptIsobaths`/`interceptCoastalNavWarnings`). Se um spec precisa de dados que o build não tem, intercepta client-side.
- **TopNow (homepage) — SSG vs re-hidratação**: o primeiro paint dos cards é SSG (`buildSpotData` em build-time), por isso o badge «Corrigido (viés regional)»/«Corrigido pela boia X» só sai baked no `out/` quando o `wave-bias.json`/`observedWave` existir em `public/data/` DURANTE o `npm run build` (teste baked-only salta com skip honesto). MAS o `HomepageTopNow` re-hidrata client-side (`useLiveGridSpotData`, mount + **15 min** + tab visível — o mesmo `refreshGridSpotScores` do grid/mapa): as rows SSG são substituídas pelas de `conditions.json` e o viés regional aplica-se em runtime, pelo que o badge aparece SEM rebuild e os testes positivos interceptam client-side (`interceptConditions` + transform `all`). Recipe local para validar o caminho baked: `node tests/e2e/fixtures/write-wave-bias-fixture.mjs && npm run build && npx playwright test topnow-wave-badge` (o fixture escreve `public/data/wave-bias.json` com ME +0.3/n=120 em todas as regiões; `public/data/` é gitignored, nunca é commitado).

## Estado actual (2026-07-21)

### ✅ Fases A + B + C concluídas

- Confiança: copy honesto, badges, Dawn Patrol guards, `compatibleSports` 185/185
- Coerência: homepage multi-desporto, URL sync filtros, unit tests scoring, docs, sitemap completo
- Diferenciação: notícias PT (ANS, Notícias do Mar, FPS), alertas email, feedback scores, dicas comunidade, PWA

### ⚠️ Dívida conhecida (não bloqueante)

1. Headers HTTP (CSP real, `X-Frame-Options`, `frame-ancestors`) — ✅ decisão S7 tomada; implementação manual pendente no dashboard Cloudflare (DNS proxied + Transform Rules) → [`SECURITY-HEADERS.md`](./SECURITY-HEADERS.md)
2. Calibração scores (C4b) — `npm run scores:analyze`; pesos só com N≥30/modalidade
3. Livecams curadas — links externos Surftotal/MEO em 31 spots (`src/lib/spotLivecams.ts`); sem embeds
4. Alertas email — ✅ E1 em produção → [`ALERTS.md`](./ALERTS.md)
5. `Access-Control-Allow-Origin: *` do GitHub Pages — removido pelo proxy Cloudflare (Regra 2 em `SECURITY-HEADERS.md`)

### Distribuição de spots

**185 spots:** surf, multisport, kitesurf, foil, wakeboard, windsurf, big-wave (ver `spots.ts`).

## Convenções

- **Idioma:** PT-PT no UI; strings em `i18n.ts` (PT/EN).
- **Tom:** directo, conciso, sem exclamações excessivas.
- **Tailwind:** utilities first; custom em `globals.css @layer components`.
- **Componentes:** server-first; `'use client'` só quando necessário.
- **Imports:** alias `@/*` → `src/*`.

## Como pedir trabalho à LLM

1. `Lê docs/CONTEXT.md` + `docs/ROADMAP.md`
2. Trabalho cirúrgico, uma fase de cada vez
3. Terminar com `npm test` + `npm run build` verde
4. Registar progresso em `ROADMAP.md` → Notas de sessão
