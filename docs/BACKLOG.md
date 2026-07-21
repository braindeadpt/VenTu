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

Routes actuais: `/pt/` e `/en/`. Adicionar `/es/`, `/fr/`, `/de/` quando idiomas estiverem traduzidos.

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
