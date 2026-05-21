# VenTu — Context for LLM sessions

Lê este ficheiro antes de qualquer trabalho no repo. Define o estado do projecto e as restrições técnicas que limitam que soluções são viáveis.

Última actualização: 2026-05-21 (auditoria completa pós-94 commits em 9 dias).

## Identidade

- **Projecto:** VenTu — plataforma open-source de condições para desportos náuticos em Portugal (surf, kitesurf, windsurf, bodyboard, SUP, wakeboard).
- **Repo:** https://github.com/braindeadpt/ventu
- **Site em produção:** https://ventu.surf/pt/
- **Licença:** MIT.

## Stack técnica

| Camada | Tecnologia | Notas |
|---|---|---|
| Framework | Next.js 14.2 + React 18.3 | App Router |
| Linguagem | TypeScript 5.4 (strict) | |
| Styling | Tailwind CSS 3.4 | Config em `tailwind.config.ts` com paletas custom (`ocean`, `surf`, `wind`, `wave`) parcialmente usadas |
| Ícones | `lucide-react` | Não trocar por outra lib |
| Charts | `recharts` | |
| Dados marinha | Open-Meteo Marine API | Free, sem auth, `wind_speed_unit=ms` em todos os fetches |
| Marés (observado) | IH OGC API (hidrografico.pt) | Free, CC-BY 4.0, 33 estações, 135 spots mapeados |
| Chat | Supabase (`@supabase/supabase-js`) | Realtime + RLS |
| IA notícias | Google Gemini Flash (primário) + Groq Llama 3.3 (fallback 1) + Cerebras (fallback 2) | Corre em GitHub Actions, cadeia sequencial com 1.5s entre providers |
| Previsões | Open-Meteo (wind + waves) + precomputed forecasts.json | CI gera a cada 3h, client carrega JSON primeiro, live API como fallback |
| Deploy | GitHub Pages (static export) | `output: 'export'` no `next.config.js` |

## Restrições técnicas críticas

São restrições estruturais — qualquer proposta tem de as respeitar.

1. **Static export.** `next.config.js` tem `output: 'export'`. Não há server-side rendering em runtime, não há API routes (todas as `app/api/*` estão fora de questão), não há middleware. Tudo o que existe em runtime é HTML/JS/CSS estático servido pelo GitHub Pages.

2. **basePath.** O site vive na raiz do domínio. Paths absolutos funcionam normalmente.

3. **Sem headers HTTP customizáveis.** GitHub Pages não permite. CSP, HSTS, etc. só via `<meta http-equiv>` no HTML — e com limitações.

4. **Sem dependências pesadas novas.** O `package.json` actual é deliberadamente leve. Antes de adicionar qualquer dep, justificar. Preferir CSS/SVG vanilla a libs (ex.: gauges, wave shapes — não precisam de uma lib).

5. **`output: 'export'` + páginas dinâmicas exigem `generateStaticParams`.** A rota `/[locale]/spots/[slug]` já o tem. Não introduzir rotas dinâmicas que não sejam estaticamente enumeráveis.

6. **Cliente vs servidor:** componentes com `'use client'` correm no browser. Componentes server (sem essa directiva) correm em **build time** (não em runtime — não há servidor). Decidir bem onde colocar o fetch de dados.

## Maré (Instituto Hidrográfico)

Sistema de marés integrado via OGC API do IH (hidrografico.pt). Dados observados reais de 33 estações oficiais — não previsão.

**Fluido:**
```
scripts/fetch-ih-tides.js
  → public/data/ih-tides.json (stations + spotMapping via Haversine < 100 km)
  → scripts/update-conditions.js lê e integra
    → public/data/conditions.json com fields:
      tideHeight, tideStatus, tideLabel, tideObservedHeight, tideObservedAt, tideStation
  → SpotDetailClient.tsx (StatCard + nota IH observed)
  → ForecastTable.tsx (row condicional "Maré" se hasTide=true)
```

**Estado actual:**
- 33 estações activas (Viana do Castelo a Vila do Porto — Açores)
- 135/167 spots mapeados (81%)
- 32 spots sem cobertura (maioria adições recentes: Porto, Aveiro, Algarve, Alentejo)
- 1 spot sem cobertura natural: Alqueva (lago interior) — tratado graciosamente

**Limitação:** dados observados (não previsão horária). Maré prevista vem do Open-Meteo `sea_level_height_msl`. As duas escalas são diferentes (MSL global vs zero hidrográfico local) — ambas são válidas e mostradas separadamente.

## Estrutura do repo

```
src/
├── app/
│   ├── layout.tsx                    Root layout
│   ├── page.tsx                      Redirect / → /pt/
│   ├── globals.css                   Tailwind + custom utilities
│   └── [locale]/
│       ├── layout.tsx                Header + Footer + metadata
│       ├── page.tsx                  HOME (client-side, usa precomputed JSON)
│       ├── spots/page.tsx            Lista (server, fetch em build)
│       ├── spots/[slug]/page.tsx     Detail (delega ao SpotDetailClient)
│       ├── favorites/page.tsx        Favoritos (localStorage)
│       ├── compare/page.tsx          Comparador VS
│       ├── news/page.tsx             Notícias (lê public/data/news.json)
│       └── about/page.tsx            Sobre
├── components/
│   ├── layout/Header.tsx, Footer.tsx
│   ├── spots/SpotCard.tsx, SpotGrid.tsx, SpotDetailClient.tsx,
│   │         SpotMap.tsx, SpotChat.tsx, SessionForecastChart.tsx,
│   │         LocalTipsSection.tsx, SecretTipsSection.tsx,
│   │         WaterQualityBadge.tsx, FacilityIcon.tsx
│   ├── weather/ConditionCard.tsx, ForecastChart.tsx, ForecastTable.tsx
│   ├── news/NewsCard.tsx
│   ├── ui/WindCompass.tsx, ScoreGauge.tsx, WaveShape.tsx, SwellRadar.tsx,
│   │     SocialShare.tsx, SeoHead.tsx, MagicWindows.tsx
│   ├── FavoriteButton.tsx, TrendIndicator.tsx, SportSelector.tsx,
│   │   HtmlLang.tsx, SecurityHeaders.tsx
│   ├── DawnPatrolBanner.tsx, DawnPatrolBannerWrapper.tsx   ← VIVO (home page)
│   └── SwellDetective.tsx                                   ← DEAD CODE intencional
├── lib/
│   ├── spots.ts                      167 spots
│   ├── openmeteo.ts                  Fetch + parsing Open-Meteo
│   ├── sportScore.ts                 Scoring 0-100 por desporto
│   ├── sportRatings.ts               Tipos SportType
│   ├── load-spot-data.ts             Loader de precomputed conditions
│   ├── dataLoader.ts                 Leitura de conditions.json em build
│   ├── wind.ts                       Cardinal helpers + setas
│   ├── paths.ts                      getAssetPath para basePath
│   ├── i18n.ts                       Translations PT/EN
│   ├── spotTips.ts                   Local tips por spot
│   ├── chatModeration.ts             Filtro de palavrões + rate limit
│   ├── supabase-config.ts            Anon key hardcoded como fallback
│   └── supabase.ts                   Client lazy
├── types/index.ts                    Spot, MarineData, NewsItem, Locale
└── ...
    └── llm-fallback.js               Cadeia Gemini → Groq → Cerebras

public/
├── data/
│   ├── conditions.json              136/167 spots preenchidos (CI a cada 3h)
│   ├── forecasts.json               Precomputed hourly (gerado pelo CI)
│   ├── ih-tides.json                Estações IH + spot mapping
│   ├── dawn-patrol.json             Gerado por workflow diário
│   └── news.json                    Gerado por workflow RSS+LLM
├── sw.js                            Service Worker
├── favicon.svg, apple-touch-icon.svg
├── manifest.json, robots.txt, sitemap.xml

scripts/
├── update-conditions.js              GH Action: actualiza conditions.json + forecasts.json a cada 3h
├── fetch-ih-tides.js                 GH Action: busca estações IH, mapeia spots
├── update-news.js                    GH Action: RSS + LLM (Gemini→Groq→Cerebras)
├── dawn-patrol.js                    GH Action diária: geração matinal LLM
└── news/
    ├── fetch-rss.js                  6 feeds RSS
    └── llm-tasks.js                  Funções LLM categorização/tradução/síntese

.github/workflows/
├── deploy.yml                        Build + deploy GitHub Pages (on push)
├── update-data.yml                   Cron 3h para marés + condições + notícias
└── dawn-patrol.yml                   Cron diário 06:00 Lisboa

docs/
├── REDESIGN-SPEC.md                  Spec antiga (parcialmente implementada)
├── PLANO-REORGANIZACAO.md
├── BACKLOG.md                        Pendências organizadas
├── CONTEXT.md                        ← este ficheiro
└── UX-AUDIT.md                       ← audit detalhado
```

## Estado actual conhecido (bugs e dívida)

### ✅ Resolvidos (mantidos por contexto histórico)

- **Unidades de vento.** Commit `1f58255`. O bug real era que `scoreSurf`, `scoreBodyboard` e `scoreSUP` comparavam `windSpeed` (m/s) contra thresholds em knots. Corrigido adicionando `const windKt = c.windSpeed * 1.94384` nas três funções.
- **Slugs duplicados em `spots.ts`.** Verificado: `grep` zero output. `update-conditions.js` tinha 8 duplicados + 1 ID errado eliminados em `8f4785e`.
- **`findIndex(...) || 0`.** ✅ Ambos `openmeteo.ts` e `update-conditions.js` usam `Math.max(0, ...)`.
- **Página de notícias.** Já não usa `mockNews` — lê `public/data/news.json`.
- **Home page fetches.** Já não faz 167 fetches paralelos — usa precomputed conditions.json.
- **`conditions.json` vazio.** Agora tem 136/167 spots preenchidos via CI a cada 3h.

### ❌ Bugs activos

1. **`SecurityHeaders.tsx` injecta CSP via JS** em runtime — sem efeito real em static export.
2. **Inter declarada em `globals.css` mas nunca carregada.** Site usa system fonts.
3. **`manifest.json` start_url é `/pt` e o site vive em `/pt/`.** Redirecciona browser para rota errada.
4. **AlertBanner.tsx** — ficheiro existe mas não é importado em lado nenhum (dead code).
5. **SwellDetective.tsx** — dead code intencional (preservado à espera de dados históricos reais).

### Distribuição de spots

**167 spots total:**
- 96 surf · 33 multisport · 27 kitesurf · 4 foil · 3 wakeboard · 2 windsurf · 2 big-wave

**compatibleSports:**
- 89/167 preenchidos (53%)
- 78 pendentes (maioria surf-only legítimos — campo opcional para single-sport)
- **Críticos pendentes (~14):** spots type=kitesurf ou type=foil sem compatibleSports — foz-arelho, lagoa-albufeira, fonte-telha, barrinha-esmoriz, foil-alvor, vila-real-santo-antonio, monte-gordo, praia-verde, altura, lagos, barrinha-faro, funchal, amorosa, foil-foz-arelho

## Bugs activos descobertos pela auditoria (21/Maio)

1. ~~**ForecastTable capped silenciosamente.** SpotDetailClient passa `hours={120}`. ForecastTable.MAX_HOURS = 72 (regressão da Fase 5d.1). Utilizador vê 3 dias em vez de 5.~~ ✅ **Fixed** — `efd84fb`. MAX_HOURS bumped to 120.

2. ~~**WindCompass labels rodam com a seta.** Bug visual em todos os spot details. Regressão posterior à Fase 2c.~~ ✅ **Already fixed** em `b34c65b` (Fase 2c). Stale bug report.

3. **31 spots novos sem entradas em conditions.json.** Adicionados após último CI run. Aguardam próxima execução de `update-data.yml` (3h).

4. **32 spots sem tide station.** Maioria adições recentes (Porto, Aveiro, Algarve). Não é crítico — display condicional cobre.

5. **78 spots sem compatibleSports.** Prioridade: ~14 kitesurf/foil spots (sem compatibleSports o frontend não sabe que desportos mostrar). Restantes 64 são surf-only (cosmético).

6. ~~**Filtro de regiões na homepage.** `REGIONS` usa macros, `spot.region` usa municípios.~~ ✅ **Fixed** — `fdad5af`. Added 10 missing municipality mappings; fallback changed from 'Lisboa' to '' (safe). All 50 municipalities now mapped.

## Features implementadas (Maio 2026)

- **IH Tide integration** — 33 estações IH, 135 spots mapeados, display duplo (previsto + observado) no SpotDetailClient e ForecastTable
- **Precomputed forecasts system** — `forecasts.json` com 7 dias de dados horários por spot; SpotDetailClient carrega precomputed first, live API como fallback
- **MagicWindows** — componente de "best windows" substituiu placeholder anterior
- **Sport scoring 0-100** — `sportScore.ts` com thresholds calibrados para surf, kitesurf, windsurf, bodyboard, SUP, wakeboard
- **Dawn Patrol workflow** — CI diário 06:00 com LLM chain (Gemini → Groq → Cerebras)
- **SeoHead, SocialShare, FavoriteButton** — integrados no SpotDetailClient
- **ForecastTable redesign** — color tiers por intensidade, day picker, conditional rows (gust, water, tide aparecem apenas se data existe), sticky headers, hover column highlight
- **SpotDetailClient redesign** — ScoreGauge, WaveShape, SwellRadar, MagicWindows, StatCard grid com tide
- **+87 novos spots** (80 → 167), correcção de coordenadas, modalidades, descrições
- **94 commits entre 12-21 Maio** sem auditoria intermédia — maior parte adições/correcções de spots, tide integration, precomputed forecasts, refinements visuais

## Convenções

- **Idioma do projecto:** Português europeu (PT-PT). Strings duplicadas em `i18n.ts` para PT/EN.
- **Tom:** directo, conciso. Não usar exclamações excessivas. Não usar emojis em UI excepto onde já existem (avisos, chat empty states).
- **Comentários no código:** em inglês ou português — escolher um por ficheiro e manter.
- **Tailwind:** usar utilities, evitar `@apply` excepto para componentes que se repetem em múltiplos sítios. Custom em `globals.css @layer components`.
- **Componentes:** server-first sempre que possível. `'use client'` só quando há `useState`, `useEffect`, event handlers, ou hooks do `next/navigation`.
- **Imports:** alias `@/*` aponta para `src/*` (configurado em `tsconfig.json`).

## Como pedir trabalho à LLM

1. **Carregar este ficheiro primeiro.** `Lê docs/CONTEXT.md.`
2. **Carregar o audit/spec relevante.** `Lê docs/UX-AUDIT.md.`
3. **Pedir trabalho cirúrgico, uma fase de cada vez.** Não pedir "redesign completo". Pedir "implementa apenas a Foundation" ou "implementa o ScoreGauge isolado em `src/components/ui/`".
4. **Pedir perguntas antes de código.** `Se houver ambiguidade, faz-me 2-3 perguntas antes de gerar código.`
5. **Definir o output esperado.** "Devolve: (a) ficheiro completo do componente novo, (b) diff dos ficheiros existentes a alterar, (c) lista de imports a adicionar."
6. **Restringir escopo do diff.** `Não tocar em ficheiros fora dos que listei.`
