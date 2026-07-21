# VenTu — Roadmap Executável

> **Objectivo:** transformar o VenTu de “projecto impressionante” em “ferramenta em que confio todos os dias”.  
> **Posicionamento:** referência gratuita portuguesa multi-desporto — *não* rival do Surfline.  
> **Criado:** 2026-05-24 · **Última revisão:** 2026-05-25

---

## Como usar entre sessões

1. Consulta a **Fase E (activa)** — começa pelo primeiro item `⬜ pending`.
2. Fases **A→C** estão concluídas (referência histórica + critérios de aceitação).
3. Marca `[x]` nas checkboxes quando concluíres; actualiza Status na tabela.
4. Regista decisões na secção **Notas de sessão**.
5. Cada entrega: `npm run build` verde + verificação em https://ventu.surf/pt/
6. Documentos: [`PLANO-FASES.md`](./PLANO-FASES.md) (auditorias históricas), [`BACKLOG.md`](./BACKLOG.md), [`VISUAL-AUDIT.md`](./VISUAL-AUDIT.md), [`NEWS-SYSTEM.md`](./NEWS-SYSTEM.md)

### Importar issues no GitHub

Templates em [`ROADMAP-ISSUES.md`](./ROADMAP-ISSUES.md). Depois de `gh auth login`, criar issues por item da Fase E.

---

## Progresso — Fases A→C (concluídas)

| ID | Título | Fase | Prioridade | Status |
|----|--------|------|------------|--------|
| A1 | Dawn Patrol funcional | A | P0 | ✅ done |
| A2 | Copy honesto sobre frescura | A | P0 | ✅ done |
| A3 | Badges DEMO / stale / fallback | A | P0 | ✅ done |
| A4 | `compatibleSports` 167/167 | A | P0 | ✅ done |
| B1 | Homepage multi-desporto | B | P1 | ✅ done |
| B2 | URL sync nos filtros | B | P1 | ✅ done |
| B3 | Unit tests no scoring | B | P1 | ✅ done |
| B4 | Documentação actualizada | B | P1 | ✅ done |
| B5 | Sitemap & SEO completo | B | P1 | ✅ done |
| C1 | Notícias PT (base Cena PT) | C | P2 | ✅ done |
| C2 | Alertas por email (código) | C | P2 | ✅ done |
| C3 | Loop comunidade → `localTips` | C | P2 | ✅ done |
| C4 | Feedback scores (UI + pipeline) | C | P2 | ✅ done |
| C5 | PWA install + offline claro | C | P2 | ✅ done |

**Concluída:** 2026-05-24 (A–C) · **Batch A4 + livecams + explorar:** 2026-05-25

---

## Fase E — Activa (pós-roadmap)

> **Objectivo:** fechar lacunas de **produção**, **polish do audit visual**, e **v2** de features já lançadas.  
> **Ordem recomendada:** E1 → E2 → E3 → E4 (E4 depende de dados reais de utilizadores).

| ID | Título | Prioridade | Est. | Status |
|----|--------|------------|------|--------|
| E1 | Alertas email em produção | P0 | 1h | ✅ done |
| E2 | Polish audit visual (quick wins) | P1 | 2–3h | ✅ done |
| E3 | Notícias v2 | P1 | 4–6h | ✅ done |
| C4b | Calibração scores (pesos empíricos) | P2 | contínuo | ⬜ pending |
| E5 | Mapa / UX mapa (vento legível) | P1 | 1h | ✅ done |
| E6 | Livecams embed + expansão | P2 | 4h+ | ✅ done |

**Fase activa:** pós-E1 — cobertura obs ilhas / calibração scores · vento costeiro METAR/ICON-EU (#15)

---

### E1 — Alertas email em produção

**Estado:** ✅ produção confirmada (2026-07-21) — secrets + cron + smoke test.

**Tarefas:**

- [x] Confirmar `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` nos GitHub Secrets (+ `RESEND_FROM`)
- [x] Re-aplicar `supabase/supabase-alerts-e1c.sql` (verify RPC idempotente) no Supabase SQL Editor
- [x] Correr `evaluate-alerts` manualmente (workflow_dispatch) sem erro
- [x] Subscrição teste → email recebido → link confirm/unsubscribe funciona
- [x] Documentar fluxo em [`docs/ALERTS.md`](./ALERTS.md) + `npm run alerts:preflight`
- [x] Harden digest window (Lisboa `hour >= 7`) + empty-token UX + popover copy

**Ref:** `supabase/supabase-alerts.sql`, `FavoritesAlertsPanel` / `SpotAlertPopover`, `.github/workflows/evaluate-alerts.yml`

---

### E2 — Polish audit visual (quick wins)

**Fonte:** [`VISUAL-AUDIT.md`](./VISUAL-AUDIT.md) · [`POLISH-BACKLOG.md`](./POLISH-BACKLOG.md)

**Tarefas (por impacto / tempo):**

- [x] **[P1]** `NewsCard.tsx` — já usa `card-1` (verificado)
- [x] **[P4]** `SpotGridClient` — `md:top-16` (já aplicado)
- [x] **[P3]** Status bar compacta em mobile (`HomepageStatusBar.tsx`)
- [x] **[P5]** Hero `min-h-[30vh]` mobile (`HomepageFeatured.tsx`)
- [x] **[M1]** Menu mobile animado (`Header.tsx`)
- [x] `prefers-reduced-data` no glow (`globals.css` + `hero-radial-glow-disc`)
- [x] Drawer sport pills `min-h-[44px]`; `ForecastTable` `edge-fade-x`

**Critério de saída:** `npm run audit:ux` ou revisão manual 320px + desktop sem regressões óbvias.

---

### E3 — Notícias v2

**Base feita (C1):** ANS, Notícias do Mar, FPS + `sourceRegion` + filtro «Cena PT» + feeds intl (`scripts/news/fetch-rss.js`).

**Tarefas:**

- [x] Eventos forecast 72h/24h via `forecasts.json` (`detect-events.js`)
- [x] Wakeboard por keywords (`category-keywords.js`)
- [ ] Mais RSS PT — feeds testados (Liga Surf, SAPO, Fed Surf) indisponíveis/HTML; manter ANS+NMar+FPS
- [ ] (Opcional) Reponder títulos PT com LLM para feeds ambíguos
- [x] UI `/pt/news/` abre com filtro **Cena PT** por defeito (sem `?region=` na URL)
- [x] Eventos VenTu (`detect-events`) com `sourceRegion: pt` + keywords costa PT em `category-keywords.js`

**Não repetir:** pipeline 4 etapas, spam filter, merge 7 dias — já operacional.

---

### C4b — Calibração scores (dados reais)

**Infra feita (C4):** `ScoreFeedback` no spot detail, Supabase, `analyze-score-feedback.js`.

**Tarefas:**

- [ ] Aguardar N≥30 feedbacks por modalidade antes de mudar pesos
- [ ] Correr `analyze-score-feedback.js` e rever sugestões
- [ ] Ajustar `sportScore.ts` com evidência (Nazaré ≠ Lagoa)
- [ ] Registar alterações e re-correr `npm test`

**Nota:** tuning sem dados = especulativo ([`BACKLOG.md`](./BACKLOG.md)).

---

### E5 — Mapa: setas de vento legíveis ✅

- [x] Setas maiores, halo de contraste, opacidade por intensidade (`mapWindArrow.ts`, deploy 2026-05-25)

---

### E6 — Livecams ✅

**Feito (2026-05-25):** 31 spots com links externos Surftotal/MEO (`spotLivecams.ts`). Secção «Câmara ao vivo» só em spots curados; botão abre o operador (live real). Removidos embeds Windy (timelapse) e iframes MEO.

---

## Fase A — Confiança (P0) ✅

<details>
<summary>Checklist A1–A4 (concluída 2026-05-24/25)</summary>

### A1 — Dawn Patrol funcional

- [x] Regenerar `public/data/dawn-patrol.json`
- [x] Validar slugs vs `src/lib/spots.ts`
- [x] `DawnPatrolBanner.tsx`: guard stale + validação slug
- [x] Workflow dawn-patrol (secrets + dispatch manual validado em sessão)

### A2 — Copy honesto

- [x] i18n, meta, manifest, README, páginas — sem “tempo real” enganoso
- [x] Status bar com hora de update; About explica 3h + fontes

### A3 — Badges DEMO / stale

- [x] `DataSourceBadge` + `dataFreshness.ts`
- [x] Spot detail, compare, favoritos, drawer

### A4 — `compatibleSports`

- [x] 167/167 + `scripts/validate-spots.js` no CI
- [x] 4 spots críticos + batch surf/big-wave

</details>

---

## Fase B — Coerência (P1) ✅

<details>
<summary>Checklist B1–B5 (concluída 2026-05-24)</summary>

- [x] **B1** Homepage multi-desporto (`homepageSport.ts`, `HomepageFeatured.tsx`)
- [x] **B2** URL sync filtros (`gridFilters.ts`, E2E reload)
- [x] **B3** Vitest + 20+ testes `sportScore.test.ts`, CI `npm test`
- [x] **B4** `CONTEXT.md`, README roadmap, `PLANO-FASES` superseded
- [x] **B5** `generate-sitemap.js` (~448 URLs, hreflang, JSON-LD)

</details>

---

## Fase C — Diferenciação (P2) ✅

<details>
<summary>Checklist C1–C5 (concluída 2026-05-24; C1 v2 → Fase E3)</summary>

### C1 — Notícias PT (base)

- [x] RSS PT: ANS, Notícias do Mar, FPS
- [x] `sourceRegion` + tags `cena-pt` + filtro UI
- [ ] Mais fontes PT + LLM reponder → **E3**
- [ ] Eventos forecast 72h → **E3**

### C2 — Alertas email

- [x] Supabase + Resend + formulário + confirm/unsubscribe + workflow
- [ ] Produção validada → **E1**

### C3 — Comunidade

- [x] `spotTips`, `community-tips.json`, `apply-contributions.js`

### C4 — Feedback scores

- [x] UI 3-tap + Supabase + script análise
- [ ] Pesos empíricos → **C4b**

### C5 — PWA

- [x] `InstallPrompt`, `OfflineBanner`, SW cache timestamp

</details>

---

## Fase D — Explicitamente adiado

| Item | Porquê adiar |
|------|--------------|
| Multi-modelo GFS/ECMWF | Windguru domina power users; complexidade alta |
| App nativa iOS/Android | PWA + SEO primeiro |
| Contas completas / sync favoritos | URL + localStorage + export suficiente |
| Chat global | Sem analytics que justifiquem ([`archive/CHAT-SECURITY.md`](./archive/CHAT-SECURITY.md)) |
| Câmaras embed genéricas | Descartado; links curados em 31 spots (**E6** ✅) |

---

## Métricas (2026-05-25)

| Métrica | Estado actual |
|---------|----------------|
| Dawn Patrol freshness | ≤ 24h (workflow) |
| Copy “tempo real” no UI | 0 |
| `compatibleSports` | 167/167 ✅ |
| Unit tests scoring | 31+ (incl. map/search/livecams) |
| Sitemap URLs | ~448 ✅ |
| Livecams curadas | 31 spots |
| Alertas email prod | ⬜ validar E1 |
| Feedback scores → tuning | ⬜ aguardar volume (C4b) |
| Notícias Cena PT | 3 feeds PT + intl |

---

## Notas de sessão

### 2026-05-25 — E2, E3, E6

- **E2:** status bar mobile, hero reduced-data, drawer touch, forecast edge-fade
- **E3:** `detectForecastEvents` (72h swell / 24h wind), `category-keywords.js`, testes
- **E6:** 35 livecams, MEO embed coxos/supertubos
- **Testes:** 46 vitest + `npm run build` verde
- **Próximo:** E1 alertas produção

### 2026-05-25 — Revisão roadmap + mapa vento

- **Docs:** ROADMAP reorganizado — Fase E activa; checkboxes A→C alinhadas com estado real
- **E5:** setas de vento no mapa mais legíveis (`mapWindArrow.ts`, commit `8ab3863`)
- **Próximo recomendado:** **E1** alertas produção → **E2** NewsCard + polish visual

### 2026-05-25 (noite 2) — Livecams, índice explorar, polish

- Livecams 31 spots; `/explorar/` 49 landings; tooltip status; stats `<dl>`; +11 testes

### 2026-05-25 — Pós-Fase C

- A4 167/167; FPS feed; livecams iniciais; `spots:validate` no CI

### 2026-05-24 — Fases A, B, C

- Ver histórico acima (Dawn Patrol, copy 3h, badges, homepage sport, sitemap, notícias base, alertas código, PWA, feedback UI)

<!-- Template:
### YYYY-MM-DD — Título
- Feito: ...
- Bloqueado: ...
- Próximo: ...
-->
