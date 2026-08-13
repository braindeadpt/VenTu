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
- `fetch-ih-tides.js` reutiliza o ficheiro anterior até 24h; acima disso **falha com exit 1** (guard da ronda anterior) — para este incidente, o pipeline data-update vai ficar vermelho após 24h de outage, como desenhado.

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
Formatos validados ao vivo a 2026-08-13 (o `400 invalid coords` confirma parsing WKT; os 500 seguintes são o backend). **Nota**: radius/area precisam das coordenadas das estações, que hoje vêm dos items — sem items, o fallback usa as coordenadas do último `ih-tides.json` conhecido (marégrafos fixos). **O fallback EDR já está implementado** no `fetch-ih-tides.js` (radius por estação conhecida, dedup por codp, sample-probe 3 estações antes do fetch completo) — ativar com `IH_EDR_FALLBACK=1` no env do passo do `update-data.yml` (default OFF para não martelar a API enquanto o backend estiver todo em baixo). Quando o IH recuperar, testar primeiro `items`, depois `radius` por estação conhecida.

**Monitorização**: o workflow `ih-health.yml` (de hora a hora) corre `scripts/monitor-ih-tides.sh`, que sonda o `items` e abre uma issue (label `ih-outage`) quando cai; quando recupera, **comenta e fecha a issue automaticamente** — a recuperação fica visível sem monitorização manual.

---

## 🌊 Dados em falta

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

## 📝 Como usar este backlog

- Items não estão por prioridade fixa — depende do contexto
- Quando uma fase termina, consultar este ficheiro para escolher próximo trabalho
- Items podem mover-se para uma "Fase X.Y" formal quando ficar decidido fazer
- Items podem morrer se decisão for "não fazemos"
