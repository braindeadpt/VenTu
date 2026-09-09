# VenTu — Backlog

Registo de ideias, melhorias e features identificadas mas não agendadas. Cada item tem contexto suficiente para retomar quando fizer sentido.

> **Roadmap activo:** [`ROADMAP.md`](./ROADMAP.md) — **Fase E** (pós A→C) · Templates: [`ROADMAP-ISSUES.md`](./ROADMAP-ISSUES.md)

Última actualização: 2026-05-25

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

### observedWave da Costa de Prata (boia Fugro 2 — Nazaré Costeira)

Confirmado a 2026-09-02 com a key real: `getDatawellData` **não serve a família
Fugro** (série vazia em 48 h com as estações 2/1010/1011 vivas na OGC keyless).
Os **36 spots da Costa de Prata** mapeados à boia 2 no `spotMapping` ficam sem
`observedWave` de origem IH mesmo com key. O merge degrada graciosamente
(`observedWaveMerge.js` devolve `wave: null` ou cai para a WMO — nunca inventa
leituras), mas a camada fica vazia nesses spots.

**Alternativa apontada em docs/IH_API_KEY.md**: fallback WMO ES — Cabo Silleiro
(6200084, Copernicus sem key) cobre os spots do NW dentro do alcance. Estimar o
mapeamento spot→WMO para a Costa de Prata (e, se viável, sugerir ao IH a
inclusão da família Fugro no endpoint de séries — nova OGC API EDR já anunciada).

### Qualidade da água

Tens waterTemp (Open-Meteo) mas não qualidade bacteriológica. APA (Agência Portuguesa do Ambiente) publica boletins semanais.

**Fontes**:
- APA.pt — boletins semanais de qualidade de praias
- EEA Bathing Water — dados europeus

**Limitação**: qualidade muda hora a hora com chuvas/escoamentos; real-time não está disponível em lado nenhum gratuito. Boletim semanal é o estado da arte.

**Estimativa**: 1 sessão (parse + display no spot detail).

### Imagens reais por spot

Audit original (Fase 1) identificou: `images: []` vazio em todos os spots. Decidido manter porque não há fotos curadas e o tema Coast compensa visualmente.

**Fontes potenciais**:
- Wikimedia Commons — fotos CC0 da maior parte das praias portuguesas
- Unsplash API — free tier 50 calls/h
- Flickr API — free tier

**Decisão**: trabalho de curadoria manual, não LLM. Quando for feito, considerar variant "hero" no SpotCard.

**Estimativa**: 4-6h de curadoria + 1 sessão de integração.

---

## 📹 Conteúdo visual em falta

### Livecams nos spots populares

✅ **Concluído (2026-05-25).** Links externos curados Surftotal/MEO em **31 spots** (`spotLivecams.ts`). Sem embeds (Windy = timelapse 24h; MEO = X-Frame bloqueado).

**Pendente (opcional):** expandir lista de spots com URLs MEO/Surftotal verificadas.

---

## 🛠 Cleanup técnico restante

### Fase 5b — compatibleSports manual

**Estado actual:** 185/185 preenchidos ✅

**Agendado em:** [ROADMAP.md § A4](./ROADMAP.md#a4--completar-compatiblesports) — concluído

### Chat global (adiado)

> Chat por spot foi removido em 2026-05-21 por decisão de não introduzir feature social sem analytics que justifiquem.
> Schema Supabase preservado em `supabase-schema.sql`. UI removida (SpotChat.tsx, chatModeration.ts).
> Documentação de segurança arquivada em `docs/archive/CHAT-SECURITY.md`.

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

### Bug 6: 31 spots sem conditions.json

Aguardam próxima execução de `update-data.yml` (cron 3h). Não é acção de código.

### Bug 7: 32 spots sem tide station

Maioria adições recentes. Display condicional cobre — não crítico.

---

## 🎨 UX e polish

### Search autocomplete real

✅ **Feito.** `HomepageSearch.tsx` — autocomplete modal com keyboard nav; `SearchPalette` (Cmd+K) para spots, regiões, modalidades e notícias. Pesquisa por modalidade via `spotSearch.ts`.

### Mapa interactivo da homepage

✅ **Feito.** `SpotMapInteractive.tsx` (Leaflet + MarkerCluster) integrado no grid de spots.

### SEO landing pages por combinação

✅ **Feito (2026-05-25).** Rotas estáticas `/pt/explorar/` (índice) + `/pt/explorar/{sport}-{região}/` — 49 combinações. Sitemap + footer.

Quando imagens reais por spot existirem (ver acima), considerar variante `<SpotCard variant="hero">` com imagem de fundo, para usar em destaques e top-3.

---

## 📊 Calibração e qualidade

### Recalibração de scores

Audit técnico (Fase 1) sugeriu recalibração empírica dos thresholds em `sportScore.ts`. Em particular, a fórmula de scoreSurf parece generosa — muitos spots passam ≥60 mesmo em condições medíocres.

**Recomendação**: aguardar dados reais de utilizadores (uso, feedback) antes de recalibrar. Sem isso é tuning especulativo.

### Decision: SwellDetective

Componente em `src/components/SwellDetective.tsx` está pronto mas usa mock data. Activado em SpotDetail seria teatro de feature (induz utilizadores em erro com "padrões históricos" inventados).

**Condição para activar**: pipeline de histórico real (parsing Open-Meteo archived data ou ingestion própria).

---

## 🌐 Internacionalização

### Mais idiomas

Actualmente PT/EN. Audiences potenciais não cobertas:
- ES (espanhóis que visitam PT — particularmente Algarve, Porto)
- FR (franceses — surfistas frequentes em Portugal)
- DE (alemães na Madeira)

**Trabalho**: i18n.ts tem estrutura preparada, falta tradução das ~200 strings.

**Estimativa**: 2-3h por idioma (tradução manual de qualidade).

### URLs por idioma

Routes actuais: `/pt/`, `/en/`, `/es/`, `/de/`, `/fr/` (shell i18n + SEO; copy inline `isPt` ainda cai em EN).

---

## 🔧 Infra

### SEO landing pages por combinação

Ver secção UX acima — implementado em `/explorar/[slug]/`.

### Imagens variadas no card (variante "hero")

GoatCounter integrado (privacy-first, sem cookies). Commit `e5675f5`. Script só carrega em produção com `NEXT_PUBLIC_GOATCOUNTER_CODE` configurado.

---

## 🔒 Licenças de dados (confirmação pendente)

- Marés observadas, isóbatas costeiras e avisos à navegação do IH: a licença de cada conjunto precisa de ser confirmada contra a respectiva ficha de metadados (as boias ondógrafo já foram confirmadas CC BY-NC — processo IH 0191_2026; marés/isóbatas/avisos continuam declarados CC BY sem confirmação individual).

---

## 📝 Como usar este backlog

- Items não estão por prioridade fixa — depende do contexto
- Quando uma fase termina, consultar este ficheiro para escolher próximo trabalho
- Items podem mover-se para uma "Fase X.Y" formal quando ficar decidido fazer
- Items podem morrer se decisão for "não fazemos"
