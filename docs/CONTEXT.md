# VenTu — Context for LLM sessions

Lê este ficheiro antes de qualquer trabalho no repo. Define o estado do projecto e as restrições técnicas que limitam que soluções são viáveis.

> **Prioridades de trabalho:** [`ROADMAP.md`](./ROADMAP.md) — Fase **E** activa (E1 alertas prod → E2 polish → E3 notícias v2)

Última actualização: 2026-06-03 (SEO/social OG PNG; 173 spots; schemas em `supabase/`).

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

## Restrições técnicas críticas

1. **Static export.** Sem API routes em runtime, sem middleware. Tudo é HTML/JS/CSS estático.
2. **Sem headers HTTP customizáveis** no GitHub Pages (CSP só via meta, limitado).
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

**`compatibleSports`:** 167/167 explícitos. Validação CI: `npm run spots:validate` (`scripts/validate-spots.js`).

## Maré (Instituto Hidrográfico)

```
scripts/fetch-ih-tides.js → public/data/ih-tides.json
scripts/update-conditions.js → conditions.json (tide fields)
SpotDetailClient + ForecastTable (row condicional)
```

- 33 estações IH · ~135/167 spots mapeados
- Dados observados (não previsão horária IH); previsão MSL via Open-Meteo

## Estrutura do repo (resumo)

```
src/
├── app/[locale]/          Home, spots, favorites, compare, news, about, modalidades, sazonalidade
├── components/            UI, spots, weather, layout, DawnPatrolBanner, DataSourceBadge
├── lib/                   spots.ts (167), sportScore, openmeteo, i18n, homepageSport, gridFilters
└── types/

public/data/               conditions.json, forecasts.json, news.json, dawn-patrol.json, ih-tides.json
scripts/                   update-conditions, update-news, dawn-patrol, generate-sitemap, validate-spots
tests/e2e/                 Playwright (critical-routes incl. URL filter sync)
.github/workflows/         ci.yml, deploy.yml, update-data.yml, dawn-patrol.yml
docs/                      ROADMAP.md ← fonte de verdade para prioridades
```

## SEO

- **Sitemap:** `npm run sitemap:generate` → `public/sitemap.xml` (~448 URLs: spots, modalidades, about, sazonalidade, news)
- **hreflang** pt/en no sitemap
- **JSON-LD:** `SpotDetailClient` (Beach + SportsActivityLocation), artigos news
- Geração automática no CI/deploy antes do build

## Pipelines CI

| Workflow | Frequência | O que faz |
|---|---|---|
| `update-data.yml` | 3h | conditions + forecasts + news + IH tides |
| `dawn-patrol.yml` | Diário 05:00 UTC | dawn-patrol.json via LLM |
| `ci.yml` | PR + push main | lint, validate spots, unit tests, sitemap, build, E2E |
| `deploy.yml` | push main | test, sitemap, build, GitHub Pages |
| `evaluate-alerts.yml` | */3h + manual | email alerts (Resend + Supabase) |

## Estado actual (2026-05-25)

### ✅ Fases A + B + C concluídas

- Confiança: copy honesto, badges, Dawn Patrol guards, `compatibleSports` 167/167
- Coerência: homepage multi-desporto, URL sync filtros, unit tests scoring, docs, sitemap completo
- Diferenciação: notícias PT (ANS, Notícias do Mar, FPS), alertas email, feedback scores, dicas comunidade, PWA

### ⚠️ Dívida conhecida (não bloqueante)

1. `SecurityHeaders.tsx` — CSP via JS sem efeito real em static export
2. Calibração automática de scores (C4) — recolhe feedback; ajuste de pesos manual/contínuo
3. Livecams curadas — links externos Surftotal/MEO em 31 spots (`src/lib/spotLivecams.ts`); sem embeds
4. Alertas email — código pronto; validação produção → [`ALERTS.md`](./ALERTS.md) (E1)

### Distribuição de spots

**167 spots:** surf, multisport, kitesurf, foil, wakeboard, windsurf, big-wave (ver `spots.ts`).

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
