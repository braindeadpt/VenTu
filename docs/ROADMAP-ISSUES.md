# VenTu — Templates de Issues GitHub

Copiar cada bloco para `gh issue create` ou criar manualmente no GitHub.  
Labels sugeridos: `phase-a`, `phase-b`, `phase-c`, `trust`, `product`, `seo`, `docs`, `good-first-issue`

---

## Labels a criar (uma vez)

```
phase-a       — Fase A: Confiança (P0)
phase-b       — Fase B: Coerência (P1)
phase-c       — Fase C: Diferenciação (P2)
trust         — Camada de confiança / honestidade de dados
product       — Coerência de produto
seo           — SEO e discoverability
docs          — Documentação
```

```bash
gh label create "phase-a" --color "B60205" --description "Fase A — Confiança"
gh label create "phase-b" --color "D93F0B" --description "Fase B — Coerência"
gh label create "phase-c" --color "FBCA04" --description "Fase C — Diferenciação"
gh label create "trust" --color "0E8A16" --description "Confiança e honestidade"
gh label create "product" --color "1D76DB" --description "Coerência de produto"
gh label create "seo" --color "5319E7" --description "SEO"
gh label create "docs" --color "C5DEF5" --description "Documentação"
```

---

## A1 — Dawn Patrol funcional

**Title:** `A1 — Dawn Patrol: slugs correctos, JSON fresco, guard stale`

**Labels:** `phase-a`, `trust`

**Body:**

```markdown
## Contexto

O Dawn Patrol é feature de marca, mas `public/data/dawn-patrol.json` está datado de **2024-09-16** com slugs legacy (`coxos-ericeira`, `guincho-cascais`) que levam a 404. O script e workflow já existem.

Ref: [docs/ROADMAP.md#A1](docs/ROADMAP.md#a1--dawn-patrol-funcional)

## Tarefas

- [ ] Regenerar JSON via `node scripts/dawn-patrol.js`
- [ ] Validar slugs contra `src/lib/spots.ts`
- [ ] Guard stale (>24h) e slug inválido em `DawnPatrolBanner.tsx`
- [ ] Confirmar workflow `dawn-patrol.yml` + secrets GitHub

## Critérios de aceitação

- [ ] Data ≤ 24h em produção
- [ ] Links "Ver Spot" sem 404
- [ ] Aviso visível se briefing desactualizado

## Ficheiros

`public/data/dawn-patrol.json`, `scripts/dawn-patrol.js`, `src/components/DawnPatrolBanner.tsx`, `.github/workflows/dawn-patrol.yml`
```

---

## A2 — Copy honesto sobre frescura

**Title:** `A2 — Substituir "tempo real" por copy honesto (3h cadência)`

**Labels:** `phase-a`, `trust`

**Body:**

```markdown
## Contexto

Dados actualizam a cada 3h mas copy em ~15 ficheiros promete "tempo real". Destrói confiança na praia.

Ref: [docs/ROADMAP.md#A2](docs/ROADMAP.md#a2--copy-honesto-sobre-frescura-de-dados)

## Tarefas

- [ ] Actualizar `src/lib/i18n.ts` (PT + EN)
- [ ] Meta tags: layout, SeoHead, manifest, páginas estáticas
- [ ] README PT/EN
- [ ] About: explicar cadência + fontes

## Critérios de aceitação

- [ ] Zero "tempo real" / "real-time" no UI e meta (excepto docs históricos)
- [ ] Status bar homepage mantém hora de update
```

---

## A3 — Badges DEMO / stale / fallback

**Title:** `A3 — Badge visível para mock, stale e fallback em toda a UI`

**Labels:** `phase-a`, `trust`

**Body:**

```markdown
## Contexto

`openmeteo.ts` pode devolver dados mock silenciosamente. Badge DEMO só existe em Compare/Favoritos.

Ref: [docs/ROADMAP.md#A3](docs/ROADMAP.md#a3--badges-demo--stale--fallback-em-toda-a-ui)

## Tarefas

- [ ] Componente `DataSourceBadge` partilhado
- [ ] Integrar em SpotDetail, SpotGrid/Card, Homepage
- [ ] Threshold stale: >3h amarelo, >12h vermelho
- [ ] Migrar Compare + Favoritos para componente comum

## Critérios de aceitação

- [ ] Falha Open-Meteo → DEMO visível no spot detail
- [ ] Dados antigos → badge stale
```

---

## A4 — compatibleSports em falta

**Title:** `A4 — Completar compatibleSports (117/167 → 167/167)`

**Labels:** `phase-a`, `product`

**Body:**

```markdown
## Contexto

50 spots sem `compatibleSports` explícito. 4 críticos (foil/wake/multisport) afectam scoring.

Críticos: `foil-lagoa-albufeira`, `alqueva`, `praia-rocha`, `lagos-wakepark`

Ref: [docs/ROADMAP.md#A4](docs/ROADMAP.md#a4--completar-compatiblesports)

## Tarefas

- [ ] Preencher 4 críticos
- [ ] Batch 46 surf-only restantes
- [ ] Script validação CI
- [ ] Remover TODO em sportRatings.ts

## Critérios de aceitação

- [ ] 167/167 com compatibleSports
- [ ] CI falha se spot novo sem campo
```

---

## B1 — Homepage multi-desporto

**Title:** `B1 — Homepage: sort e ticker por modalidade preferida`

**Labels:** `phase-b`, `product`

**Body:**

```markdown
## Contexto

Homepage ordena sempre por surf score. Kiter vê ranking enviesado.

Ref: [docs/ROADMAP.md#B1](docs/ROADMAP.md#b1--homepage-multi-desporto)

## Tarefas

- [ ] Sport preferido em localStorage
- [ ] Sort/ticker/hero usam modalidade activa
- [ ] Melhor score entre compatibleSports no hero

## Dependências

- Requer Fase A deployada
```

---

## B2 — URL sync filtros

**Title:** `B2 — Sincronizar filtros sport/region com URL (?sport=&region=)`

**Labels:** `phase-b`, `product`

**Body:**

```markdown
## Contexto

Grid lê URL params mas não escreve. Links partilhados perdem filtros.

Ref: [docs/ROADMAP.md#B2](docs/ROADMAP.md#b2--url-sync-nos-filtros-do-grid)

## Tarefas

- [ ] history.replaceState ao mudar filtros
- [ ] Reload preserva estado
- [ ] Teste E2E
```

---

## B3 — Unit tests scoring

**Title:** `B3 — Unit tests para sportScore.ts (20+ casos)`

**Labels:** `phase-b`, `trust`

**Body:**

```markdown
## Contexto

Scoring é o diferencial do produto; zero testes unitários.

Ref: [docs/ROADMAP.md#B3](docs/ROADMAP.md#b3--unit-tests-no-scoring)

## Tarefas

- [ ] Setup Vitest
- [ ] Casos: Guincho offshore, Nazaré big swell, lagoa flat, getCompatibleSports
- [ ] CI step npm test
```

---

## B4 — Documentação

**Title:** `B4 — Actualizar CONTEXT.md e README`

**Labels:** `phase-b`, `docs`

**Body:**

```markdown
## Contexto

CONTEXT.md referencia Next 14, chat activo, contagens erradas.

Ref: [docs/ROADMAP.md#B4](docs/ROADMAP.md#b4--documentação-actualizada)

## Tarefas

- [ ] CONTEXT.md stack actual
- [ ] README link roadmap
- [ ] Nota em PLANO-FASES.md
```

---

## B5 — Sitemap SEO

**Title:** `B5 — Sitemap dinâmico + JSON-LD spots`

**Labels:** `phase-b`, `seo`

**Body:**

```markdown
## Contexto

sitemap.xml estático omite about, sazonalidade, modalidades, news.

Ref: [docs/ROADMAP.md#B5](docs/ROADMAP.md#b5--sitemap--seo-completo)

## Tarefas

- [ ] scripts/generate-sitemap.js no CI
- [ ] hreflang pt/en
- [ ] JSON-LD por spot
```

---

## C1–C5 (Fase C — criar quando B estiver ~80%)

Ver secções C1–C5 em [docs/ROADMAP.md](docs/ROADMAP.md#fase-c--diferenciação-p2).

---

## Milestone sugerido

**Milestone: VenTu Trust (Fase A)** — issues A1–A4  
**Milestone: VenTu Coherence (Fase B)** — issues B1–B5  
**Milestone: VenTu Differentiation (Fase C)** — issues C1–C5

```bash
gh milestone create "VenTu Trust (Fase A)" --due-date 2026-06-07 --description "Camada de confiança antes de marketing"
gh milestone create "VenTu Coherence (Fase B)" --due-date 2026-07-01 --description "Produto multi-desporto coerente"
```
