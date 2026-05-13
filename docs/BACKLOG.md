# VenTu — Backlog

Registo de ideias, melhorias e features identificadas mas não agendadas. Cada item tem contexto suficiente para retomar quando fizer sentido.

Última actualização: 2026-05-11

---

## 🌊 Dados em falta

### Marés (alta prioridade)

Para surf, kitesurf e SUP, a maré determina se um spot funciona. Carcavelos, Costa Caparica, vários spots do Algarve dependem fortemente.

**Fonte recomendada**: Instituto Hidrográfico (hidrografico.pt) — dados oficiais de marés para portos portugueses, gratuito. API pouco documentada mas há projectos open-source que fazem parse.

**Alternativas avaliadas (Fase 5 audit)**:
- NOAA Tides — cobertura focada EUA, pobre para PT
- WorldTides API — free tier 100 calls/dia (insuficiente para 80 spots × cron horário)
- Stormglass — free tier 10 calls/dia (combina mal)

**Estimativa de esforço**: 1-2 sessões (parse + ingestion + UI no spot detail).

### Qualidade da água

Tens waterTemp (Open-Meteo) mas não qualidade bacteriológica. APA (Agência Portuguesa do Ambiente) publica boletins semanais.

**Fontes**:
- APA.pt — boletins semanais de qualidade de praias
- EEA Bathing Water — dados europeus

**Limitação**: qualidade muda hora a hora com chuvas/escoamentos; real-time não está disponível em lado nenhum gratuito. Boletim semanal é o estado da arte.

**Estimativa**: 1 sessão (parse + display no spot detail).

### Imagens reais por spot

Audit original (Fase 1) identificou: `images: []` vazio em todos os 80 spots. Decidido manter porque não há fotos curadas e o tema Coast compensa visualmente.

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

Todos os 80 spots em `src/lib/spots.ts` têm `compatibleSports` vazio. O helper `getCompatibleSports()` em `sportRatings.ts` usa fallback heurístico baseado em `spot.type`.

**Trabalho**: preencher manualmente cada spot com a lista de desportos que faz sentido praticar lá. Requer conhecimento de domínio (não só LLM).

**Estimativa**: 1-2h de trabalho do utilizador + 30 min LLM para validar e formatar.

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
