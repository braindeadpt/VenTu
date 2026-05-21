# VenTu — Backlog

Registo de ideias, melhorias e features identificadas mas não agendadas. Cada item tem contexto suficiente para retomar quando fizer sentido.

Última actualização: 2026-05-21

---

## ✅ Concluído (Maio 2026)

### Marés (IH OGC API)

✅ **Feito.** Sistema de marés integrado via OGC API do Instituto Hidrográfico (hidrografico.pt). Cobertura: 33 estações, 135/167 spots mapeados. Display duplo: previsão Open-Meteo + observado IH.

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

Audit original (Fase 1) identificou: `images: []` vazio em todos os 167 spots. Decidido manter porque não há fotos curadas e o tema Coast compensa visualmente.

**Fontes potenciais**:
- Wikimedia Commons — fotos CC0 da maior parte das praias portuguesas
- Unsplash API — free tier 50 calls/h
- Flickr API — free tier

**Decisão**: trabalho de curadoria manual, não LLM. Quando for feito, considerar variant "hero" no SpotCard.

**Estimativa**: 4-6h de curadoria + 1 sessão de integração.

---

## 📹 Conteúdo visual em falta

### Livecams nos spots populares

Várias praias portuguesas têm webcams públicas: Carcavelos, Costa Caparica, Guincho, Supertubos, Nazaré, Ribeira d'Ilhas. Algumas têm streams YouTube 24/7.

**Implementação**:
- iframe directo ou YouTube embed nos 5-6 spots principais
- Custo: zero (gratuito)
- Risco: URLs de streams privados podem mudar

**Estimativa**: 1 sessão (sourcing das URLs + componente <Livecam> + integração no SpotDetail).

**Valor UX**: alto — single biggest "wow" por menor custo.

---

## 🛠 Cleanup técnico restante

### Fase 5b — compatibleSports manual

**Estado actual:** 89/167 spots preenchidos (53%). 78 spots pendentes. A maioria são surf-only onde compatibleSports é opcional.

**Críticos (~14 spots):** spots type=kitesurf ou type=foil sem compatibleSports:
foz-arelho, lagoa-albufeira, fonte-telha, barrinha-esmoriz, foil-alvor, vila-real-santo-antonio, monte-gordo, praia-verde, altura, lagos, barrinha-faro, funchal, amorosa, foil-foz-arelho

**Estimativa restante**: ~30 min LLM para os 14 críticos + 1-2h utilizador para os restantes 64.

### Fase 5c — Chat security

Chat anónimo via Supabase. RLS policies precisam de auditoria:
- Rate limiting actual é cliente-side (`chatModeration.ts`), reseta com F5
- Rate limit real precisa de RLS policy server-side ou RPC function

**Risco**: spam massivo via API directa do Supabase (key pública no bundle).

**Estimativa**: 1 sessão. Inclui:
- Audit das policies actuais (utilizador faz no Supabase dashboard)
- Preparação de SQL pela LLM
- Execução do SQL pelo utilizador

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

### Mapa interactivo da homepage

Removida em Fase 4c por execução inadequada (SVG path inventado pela LLM). Vale reconsiderar com bibliotecas reais:

- **Leaflet + CartoDB Positron tiles**: gratuito, dark + light themes disponíveis, ~40 KB no bundle. Recomendado.
- **Mapbox**: melhor estilo customizável mas requer API key + risco de tier pago.

**Estimativa**: 1 sessão (Leaflet) + 30 min de ajustes visuais.

**Valor UX**: utilizadores queixaram-se de não conseguir localizar spots geograficamente.

### Search autocomplete real

Hero da homepage tem input "Procurar spot..." que actualmente é só link para `/spots/`. Falta:

- Autocomplete em tempo real
- Match em name + region + sport
- Keyboard navigation

**Estimativa**: 1 sessão. Cliente-side com fuzzy search sobre spots.ts.

### Imagens variadas no card (variante "hero")

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

Filtros da homepage são client-side. Para SEO de combinações populares (sport × região), gerar rotas estáticas:
- `/pt/surf/` — landing page com spots de surf
- `/pt/kitesurf-algarve/` — sport × região
- `/pt/melhores-spots-fim-de-semana/` — combinações editoriais

**Estimativa**: 1-2 sessões. Aumenta páginas geradas mas com benefício SEO real.

### Analytics

Não há analytics actualmente. Considerar:
- **Plausible.io** — privacidade-first, gratuito self-hosted
- **GoatCounter** — open source, free tier
- **Umami** — open source

Decisão de privacidade: nenhum cookie banner se usar plataforma sem cookies.

---

## 📝 Como usar este backlog

- Items não estão por prioridade fixa — depende do contexto
- Quando uma fase termina, consultar este ficheiro para escolher próximo trabalho
- Items podem mover-se para uma "Fase X.Y" formal quando ficar decidido fazer
- Items podem morrer se decisão for "não fazemos"
