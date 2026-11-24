# VenTu — Backlog

Registo de ideias, melhorias e features identificadas mas não agendadas. Cada item tem contexto suficiente para retomar quando fizer sentido.

> **Roadmap activo:** [`ROADMAP.md`](./ROADMAP.md) — **Fase E/C4b** (calibração scores) · Design v6 «Atlântico» entregue 2026-11 · Templates: [`ROADMAP-ISSUES.md`](./ROADMAP-ISSUES.md)

Última actualização: 2026-11-24

---

## ✅ Concluído (Maio 2026)

### Marés (IH OGC API)

✅ **Feito.** Sistema de marés integrado via OGC API do Instituto Hidrográfico (hidrografico.pt). Cobertura: 33 estações, maioria dos spots continentais mapeados. Display duplo: previsão Open-Meteo + observado IH.

**Fluxo actual:** `fetch-ih-tides.js` → `ih-tides.json` → `update-conditions.js` lê e integra → `conditions.json` com fields tideHeight, tideObservedHeight, tideStation → SpotDetailClient (StatCard + nota IH observed) + ForecastTable (row condicional "Maré").

**Alternativas rejeitadas:** NOAA (cobertura PT fraca), WorldTides (100 calls/dia insuficiente), Stormglass (10 calls/dia).

### 🔴 Incidente 2026-08-13 — backend de marés IH em baixo (todos os endpoints 500)

**Sintoma**: `tide_obs_nrt/items` devolve `500 Internal Server Error` (e `NoApplicableCode — query error` nos endpoints EDR). Persistente em todos os params testados (`limit`, `bbox`, `radius`, `properties`, `f=json|jsonld|csv`).

**Diagnóstico verificado ao vivo**:
- **Não é a API toda** — `buoys_datawell/items`, `hfr_stations/items`, `wreck_point/items` respondem 200. O que está em baixo é a fonte de observações de maré (o join com `tide_obs_data_nrt_l1`).
- **O fallback legado morreu**: `tide_obs_stations_nrt` foi **removido da API** (404) — removido do `COLLECTIONS` do `fetch-ih-tides.js`.
- `geoportal.hidrografico.pt` / `wms.hidrografico.pt` inacessíveis; `www.hidrografico.pt/mares` → 404 (portal web também degradado).
- `fetch-ih-tides.js` reutiliza o ficheiro anterior e **nunca falha** (exit 0 sempre): o guard de 24h (`MAX_STALE_HOURS`) tornou-se um warning de idade (decisão `c16802b8` — não bloquear Open-Meteo/obs durante uma outage IH).

### 🔴 Incidente 2026-09-08 — schema mudou: items devolve 200 mas só metadados

**Sintoma**: `tide_obs_nrt/items` voltou a responder **HTTP 200 com `features`** — mas as features já não trazem os campos de observação (`last_sea_surface_height`/`last_date_time`; os antigos `last_obs`/`last_data` desapareceram do schema). `stationFromFeature` rejeita todas as features (null) → zero estações → o fetch lança e reutiliza o `ih-tides.json` anterior. `fetchedAt` ficou em 2026-07-29 (41 dias) com o pipeline **verde**: é o estado mais perigoso — a API "responde" e o monitor antigo (HTTP 200 + features) não distinguia.

**Verificado ao vivo (2026-09-08 ~11:00 UTC)**:
- `items?limit=100` → 200, features com properties só `codp/title/category/lat/lon` — sem `last_sea_surface_height` nem `last_date_time` em nenhum param (`limit`, `bbox`, `properties`, `f=json|jsonld|csv`).
- EDR `radius` (WKT `POINT(lon lat)`, `within=50000`) → **500 `NoApplicableCode`** — o fallback EDR continua morto; o sample-probe (gate automático no `fetch-ih-tides.js`) falha e a run reutiliza o ficheiro anterior. No dia em que o EDR voltar a servir campos de observação, a próxima run recupera sozinha.
- Outras colecções (`buoys_datawell`, `hfr_stations`) continuam 200 com dados — a regressão é específica da fonte de marés.

**Mitigação**: camada `tideLayer` no `pipeline-meta.json` (ok/stale/down + streak, derivado do `fetchedAt` do `ih-tides.json`), chip no About «Camada de marés IH (observadas)», monitor `monitor-ih-tides.sh` agora exige os campos de observação (não só HTTP 200), e health-check unificado avisa (nunca falha o job — decisão `c16802b8`) a partir de 3 runs sem leituras novas.

**Receita de recuperação (EDR — existe e documentada, mas partilha o mesmo backend em baixo)**:

O `tide_obs_nrt` expõe endpoints OGC API EDR além dos items (ver `/openapi?f=json`, pygeoapi 0.23.5):
```
# radius — WKT POINT (lon lat, espaço!): estações a X metros de um ponto
GET /collections/tide_obs_nrt/radius?coords=POINT(-9.4 38.7)&within=50000&f=json
# area — WKT POLYGON (anel fechado): estações dentro do polígono
GET /collections/tide_obs_nrt/area?coords=POLYGON((-9.5 38.5,-9.5 39.0,-9.0 39.0,-9.0 38.5,-9.5 38.5))&f=json
# locations + locations/{locId}
GET /collections/tide_obs_nrt/locations?f=json
```
Formatos validados ao vivo a 2026-08-13 (o `400 invalid coords` confirma parsing WKT; os 500 seguintes são o backend). **Nota**: radius/area precisam das coordenadas das estações, que hoje vêm dos items — sem items, o fallback usa as coordenadas do último `ih-tides.json` conhecido (marégrafos fixos). **O fallback EDR está implementado e AUTO** no `fetch-ih-tides.js` (radius por estação conhecida, dedup por codp, sample-probe 3 estações antes do fetch completo). O gate de segurança é o próprio probe: só avança para o fetch completo quando as features de amostra trouxerem **campos de observação utilizáveis** (`stationFromFeature` não-nulo) — com o backend partido o probe falha e o fallback desiste sem martelar a API; `IH_EDR_FALLBACK=0` desliga a sondagem (opt-out explícito).

**GATE de ativação — correr quando o IH recuperar**: `npm run ih:validate` (`scripts/validate-ih-edr-schema.js`) faz o probe real ao `radius` EDR com as coordenadas das estações conhecidas e valida que o schema das features (`codp`, `last_sea_surface_height`/`last_date_time`, `geometry.coordinates` para o fallback de posição) **bate com o `stationFromFeature`** — reutiliza o parser real do pipeline:
```
# 1. o monitor (ih-health.yml) fecha a issue ih-outage quando o items voltar
# 2. o pipeline recupera SOZINHO: o probe EDR no fetch-ih-tides.js valida os
#    campos de observação em cada run (nada a ativar manualmente)
# 3. GATE pré-flight (opcional): npm run ih:validate
#    exit 0 → schema OK → a próxima run usa o EDR automaticamente
#    exit 1 → schema mudou → atualizar stationFromFeature ANTES de o probe validar
#    exit 2 → backend ainda em baixo / sem dados → voltar a correr mais tarde
```

**Monitorização**: o workflow `ih-health.yml` (de hora a hora) corre `scripts/monitor-ih-tides.sh`, que sonda o `items` e abre uma issue (label `ih-outage`) quando cai; quando recupera, **comenta e fecha a issue automaticamente** — a recuperação fica visível sem monitorização manual.

### 🔴 Incidente 2026-09-08/09 — radar IPMA: slots publicadas sem PNGs (`path: null`)

**Sintoma**: o manifest `imgs-radar.json` continua **fresco** (slots de 5 em 5 min, ex. «2026-09-09 21:50») mas **todas as entradas vêm com `path: null`** — e os PNGs reais dão 404 (o último frame válido é o de 2026-09-08 23:25). Verificado ao vivo a 2026-09-09: 37 slots publicadas, 0 com `path` .png; `parseManifest` devolve `[]` → o fetch mantém o último frame bom (exit 0).

**Impacto**: o gate de health antigo contava o streak de «stale» do radar até `FAIL_AFTER` e **falhava o job ANTES do upload do artifact** — bloqueando o push de TODOS os dados (conditions/forecasts/observações de 185 spots). Produção sem dados frescos das 10:08 às ~20:45 do dia 09, apesar de o pipeline gerar tudo corretamente em todas as runs.

**Mitigação (fix `f92cf42ea`)**: `radarLayer` → **warnOnly** (mesma semântica das marés IH — decisão `c16802b8`): degradação a montante avisa nos logs + chip do About, nunca mais congela o push dos dados essenciais. As camadas essenciais (boias, avisos, costeiros) mantêm a falha dura.

**Monitorização**: o `ih-health.yml` corre também `scripts/monitor-ipma-radar.sh` (label `ipma-radar-outage`): sonda o manifest (≠200), as slots (0 frames válidos = `path:null`) e o PNG mais recente (≠200 = 404) — abre a issue quando degrada, comenta+fecha quando o produto recupera. Recuperação: quando o IPMA voltar a publicar paths, o próximo run do `update-data` volta a servir frames novos automaticamente.

---

## 🌊 Dados em falta

### observedWave da Costa de Prata — ✅ RESOLVIDO (WMO 6200199) + Açores (cap ilha)

A nota original assumia gap WMO na Costa de Prata; verificação 2026-09 mostrou
que **já está coberto**: WMO/Copernicus `6200199` («Nazaré Costeira» — a mesma
Fugro via GTS) serve hs fresca e o `spotMapping` WMO cobre Nazaré → Ericeira
dentro do cap de 200 km. IH Sines (`CSA83/1D`) também cobre a zona quando fresco.

O gap real eram os **Açores**: BOND2 (S. Miguel) e BOND6 (Sta Maria) inactivas
desde 2025; BOND5 (Graciosa, idEst 86 / WMO `6202400`) viva mas a 228–276 km —
mapeada e rejeitada pelo attach cap de 200 km. Fix em `scripts/lib/islandSpots.js`:
geo-box Açores/Madeira (robusto a drift de `region`), cap map/attach **280 km**
só para spots de ilha (mesma ordem da ponte Silleiro ~280–300 km), flag
`island: true` persistida no `spotMapping`, `distanceKm` real no payload
(a UI mostra «a 276 km»). Cobre **8/10** spots dos Açores; Sta Maria a ~344 km
fica honestamente fora. Continente inalterado (250/200).

Restante (não accionável): BOND2/BOND6 voltarem ao serviço — auto-cura no
próximo fetch quando o IH reportar `latest` fresco.

### Qualidade da água — ✅ FEITO (2026-09)

Integrado via APA InfoÁgua: `scripts/fetch-water-quality.js` extrai o dataset
nacional embutido em `infoagua.apambiente.pt/pt/praias` (761 águas balneares,
1 GET sem auth) → `water-quality.json` → merge em `conditions.waterQuality`
(spot → água balnear mais próxima ≤3 km, 166/185 cobertos na data da integração — com 189 spots a cobertura exacta está **por confirmar**). UI em
`WaterQualityBadge` (conselho balnear só na época, classe anual APA, alertas
activos, Bandeira Azul sem ano hardcoded). Cobertura: 86 spots <0,5 km,
160 ≤2 km.

### Imagens reais por spot

✅ **Entregue (v6, #184).** `src/lib/spotFotos.ts` + `spotFotos.json` + `public/fotos/spots/` (~60 WebP): uma foto por spot e modalidade (kite/surf), Unsplash + Wikimedia Commons com crédito por foto (`CREDITOS.md`). Cadeia de fallback honesta: real → zona → substituta (mesma região+modalidade, ≤60 km do spot curado, com o sítio real no crédito) → fundo `mar`. A home v6 usa `fotosCosta`/`metaCosta` do mesmo sistema.

---

## 📹 Conteúdo visual em falta

### Livecams nos spots populares

✅ **Concluído e expandido (2026-11).** **114 spots** com livecams curadas em `src/lib/spotLivecams.ts`: links externos Surftotal/MEO/FeelViana + embeds válidos — YouTube via `youtube-nocookie` (ex.: Cabedelo 24h) e Surfline onde o embed vive. Os dois embeds partidos da mega audit foram regularizados: `cabedelo-wakepark` ficou **link-only** (o embed Surfline devolvia 404) e `foil-cabedelo` passou a usar a câmara YouTube de Cabedelo.

**Pendente (opcional):** continuar a verificar/expandir URLs MEO/Surftotal/YouTube por spot novo.

---

## 🛠 Cleanup técnico restante

### Fase 5b — compatibleSports manual

**Estado actual:** 189/189 preenchidos ✅ (`spots.json`)

**Agendado em:** [ROADMAP.md § A4](./ROADMAP.md#a4--completar-compatiblesports) — concluído; validação contínua via `spots:validate` + `spots:catalog:check` no ci.yml

### Chat global (adiado)

> Chat por spot foi removido em 2026-05-21 por decisão de não introduzir feature social sem analytics que justifiquem.
> Schema Supabase preservado em `supabase-schema.sql`. UI removida (SpotChat.tsx, chatModeration.ts).
> Documentação de segurança arquivada fora do repo (arquivo local do mantenedor: `CHAT-SECURITY.md`) — o `docs/archive/` saiu do git em 2026-09-22 (3,2 MB de scratch, sem referências de código).

**Contexto**: Eventualmente, considerar chat global (não por spot) quando houver tráfego comprovado.
- Chat por spot era frágil (abuso via username rotation, sem CAPTCHA)
- Sem analytics a justificar manutenção de feature social
- RLS policies no schema já estão preparadas — basta criar nova UI

---

## 🐛 Bugs identificados (auditoria Maio 2026)

### Bug 1: ForecastTable capped a 72h (não 120h) ✅ FIXED

**Fix**: bump para MAX_HOURS = 120 (commit `efd84fb`).

### Bug 2: WindCompass labels rodam com a seta ✅ JÁ FIXED

**Nota**: bug foi corrigido em `b34c65b` (Fase 2c). O código actual já tem labels estáticos.

### Bug 3: Filtro de regiões na homepage ✅ FIXED

**Fix**: mapeamento completo de 50 municípios → macros em `src/lib/regions.ts` (commit `fdad5af`). Fallback alterado de 'Lisboa' para ''.

### Bug 6: spots sem conditions.json

Resolvido na prática — a pipeline cobre os 189 spots; `update-data.yml` + guards de freshness monitorizam (`staleness-alert`, `data-cadence-alert`, `ops-audit`).

### Bug 7: spots sem tide station

Display condicional cobre (marés só aparecem com estação/dados) — não crítico; a cobertura IH é a das 33 estações mapeadas.

---

## 🎨 UX e polish

### Search autocomplete real

✅ **Feito.** `HomepageSearch.tsx` — autocomplete modal com keyboard nav; `SearchPalette` (Cmd+K) para spots, regiões, modalidades e notícias. Pesquisa por modalidade via `spotSearch.ts`.

### Mapa interactivo da homepage

✅ **Feito.** `SpotMapInteractive.tsx` (Leaflet + MarkerCluster) integrado no grid de spots.

### SEO landing pages por combinação

✅ **Feito (2026-05-25).** Rotas estáticas `/pt/explorar/` (índice) + `/pt/explorar/{sport}-{região}/` — **50 combinações** actuais (7 desportos × até 7 regiões macro; derivadas de `seoLandings.ts` + `spots.json`, sitemap as inclui).

Quando imagens reais por spot existirem (ver acima), considerar variante `<SpotCard variant="hero">` com imagem de fundo, para usar em destaques e top-3.

---

## 📊 Calibração e qualidade

### Recalibração de scores

Audit técnico (Fase 1) sugeriu recalibração empírica dos thresholds em `sportScore.ts`. Em particular, a fórmula de scoreSurf parece generosa — muitos spots passam ≥60 mesmo em condições medíocres.

**Recomendação**: aguardar dados reais de utilizadores (uso, feedback) antes de recalibrar. Sem isso é tuning especulativo.

### Decision: SwellDetective

~~Componente em `src/components/SwellDetective.tsx` está pronto mas usa mock data.~~ **Componente removido** — a página de spot v6 (`SpotV6`/`MedeSabeV6`) mostra dados reais; se voltar a fazer sentido um «estudo de swell», tem de nascer de pipeline real (histórico Open-Meteo archived ou ingestão própria), nunca mock.

---

## 🌐 Internacionalização

### Mais idiomas

✅ **Entregue (2026-11).** Os 5 locales existem — pt/en/es/de/fr (`src/lib/i18n.ts`), incluindo as superfícies v6 (`homeV6.ts`, `spotPage/v6.ts`, `mapUi/*`, `nivel.ts`) com bloco próprio em cada língua. A dívida `isPt→EN` chegou a **0** (ratchet `i18nDebt.test.js`, baseline 0; ver `I18N-MIGRATION.md`).

**Resta (fora de âmbito por decisão #457):** artigos de **notícias** continuam PT/EN — as páginas `/es|de|fr/news/` ficam `noindex` até haver tradução real do conteúdo.

### URLs por idioma

Routes actuais: `/pt/`, `/en/`, `/es/`, `/de/`, `/fr/` — 5 locales completos com dicionários (a dívida `isPt→EN` está a 0; artigos de notícias es/de/fr ficam `noindex`).

---

## 🔧 Infra

### SEO landing pages por combinação

Ver secção UX acima — implementado em `/explorar/[slug]/`.

### Imagens variadas no card (variante "hero")

GoatCounter integrado (privacy-first, sem cookies). Commit `e5675f5`. Script só carrega em produção com `NEXT_PUBLIC_GOATCOUNTER_CODE` configurado.

---

## 🔒 Licenças de dados (confirmação pendente)

- Marés observadas, isóbatas costeiras e avisos à navegação do IH: a licença de cada conjunto precisa de ser confirmada contra a respectiva ficha de metadados (as boias ondógrafo já foram confirmadas CC BY-NC — processo IH 0191_2026; marés/isóbatas/avisos continuam declarados CC BY sem confirmação individual). **Por confirmar** se já foi feito desde 2026-05.

---

## ⏳ Pendentes reais (2026-11-24)

### Boias IH → OGC API EDR (migração anunciada)

O `getDatawellData` será substituído por uma **OGC API EDR** em `https://ogcapi.hidrografico.pt` (a OGC API de features já migrou em 2026-09; o antigo `api-features.hidrografico.pt` não resolve DNS). Enquanto a colecção `buoys_datawell` for Features-only (sem `data_queries`), a migração não é possível — o `ops-audit` diário vigia a publicação do EDR. Receita completa em [`IH_API_KEY.md`](./IH_API_KEY.md); gate de validação `npm run ih:validate` (`scripts/validate-ih-edr-schema.js`). Quando aterrar: trocar `fetchWaveSeries`/`DEFAULT_WAVE_API` em `scripts/lib/ihBuoys.js` pelas consultas EDR (provavelmente keyless) e a `IH_API_KEY` deixa de ser precisa para o observedWave.

### Revyl — preview builds em PRs

`pr_review` está **desactivado** em `.revyl/config.yaml`: o export estático `out/` (~1,7 GiB) excede o limite de 1 GiB do plano Revyl («Web bundle exceeds its unpacked size limit»). O site é testado em devices Revyl apontados ao live. **Reactivar** se a Revyl subir o limite do bundle — ou se se encontrar um caminho de preview mais leve (ex.: subconjunto de rotas).

### News i18n es/de/fr — fora de âmbito (decisão #457)

Os artigos continuam PT/EN; as páginas `/es|de|fr/news/` ficam `noindex` (conteúdo duplicado). Só reabrir se houver tradução real dos artigos (pipeline LLM ou curadoria).

### Specs e2e fora do CI — rever destino

Sem tag `@core` nem suite no `ci.yml`: `map-chrome`, `map-v3-explore/layers/markers`, `spot-v2-context`, `spot-v2-verdict`, `spot-v3-verdict`, `spots-filtro-ssr`, `visual-sweep`, `ipma-radar-carousel` (corre isolado). Decidir por spec: tag `@core`/`test:e2e:v6`, ou arquivar se a v6/pele os tornou obsoletos. Manuais por dados vivos: `about-wave-bias`, `map-wind-markers`. Opt-in: `axe-audit`.

### Calibração de scores (C4b — segue no ROADMAP)

`npm run scores:analyze` pronto; mudar pesos só com N≥30 feedbacks/modalidade.

### Dependências

- `next` declarado `^16.4.6` em `package.json`; se a issue pedia um bump específico, verificar se há patch mais recente (versão efectivamente instalada por confirmar sem `node_modules`).
- Advisories allowlistadas no `npm audit` do ci.yml: `GHSA-vfj7-8cjw-p6xm` (braces, dev-only) e `GHSA-fc5q-39xc-vjpf` (picomatch, dev-only) — remover da allowlist quando sair release corrigida.

---

## 📝 Como usar este backlog

- Items não estão por prioridade fixa — depende do contexto
- Quando uma fase termina, consultar este ficheiro para escolher próximo trabalho
- Items podem mover-se para uma "Fase X.Y" formal quando ficar decidido fazer
- Items podem morrer se decisão for "não fazemos"
