# VenTu — Roadmap Executável

> **Objectivo:** transformar o VenTu de “projecto impressionante” em “ferramenta em que confio todos os dias”.  
> **Posicionamento:** referência gratuita portuguesa multi-desporto — *não* rival do Surfline.  
> **Criado:** 2026-05-24 · **Próxima revisão:** após conclusão da Fase A

---

## Como usar entre sessões

1. Consulta a **tabela de progresso** abaixo — começa sempre pelo primeiro item `⬜ pending` da fase activa.
2. Marca `[x]` nas checkboxes quando concluíres uma tarefa.
3. Actualiza a coluna **Status** na tabela (`✅ done` / `🔄 wip` / `⬜ pending`).
4. Regista decisões ou bloqueios na secção **Notas de sessão** no fim do ficheiro.
5. Cada fase termina com `npm run build` verde + verificação manual em https://ventu.surf/pt/
6. Documentos relacionados: [`PLANO-FASES.md`](./PLANO-FASES.md) (auditorias históricas), [`BACKLOG.md`](./BACKLOG.md) (ideias futuras)

### Importar issues no GitHub

`gh` não estava autenticado em 2026-05-24. Templates prontos em [`ROADMAP-ISSUES.md`](./ROADMAP-ISSUES.md).  
Depois de `gh auth login`:

```bash
# Exemplo — criar issue da Fase A1
gh issue create --title "A1 — Dawn Patrol: slugs, JSON fresco, guard stale" --label "phase-a,trust" --body-file docs/issue-templates/A1-dawn-patrol.md
```

---

## Progresso global

| ID | Título | Fase | Prioridade | Est. | Status |
|----|--------|------|------------|------|--------|
| A1 | Dawn Patrol funcional | A | P0 | 3h | ✅ done |
| A2 | Copy honesto sobre frescura | A | P0 | 2h | ✅ done |
| A3 | Badges DEMO / stale / fallback | A | P0 | 3h | ✅ done |
| A4 | `compatibleSports` em falta | A | P0 | 1h | ✅ done |
| B1 | Homepage multi-desporto | B | P1 | 4h | ✅ done |
| B2 | URL sync nos filtros | B | P1 | 2h | ✅ done |
| B3 | Unit tests no scoring | B | P1 | 4h | ✅ done |
| B4 | Documentação actualizada | B | P1 | 2h | ✅ done |
| B5 | Sitemap & SEO completo | B | P1 | 3h | ✅ done |
| C1 | Notícias PT | C | P2 | 6h | ⬜ pending |
| C2 | Alertas por email | C | P2 | 12h | ⬜ pending |
| C3 | Loop comunidade → `localTips` | C | P2 | 8h | ⬜ pending |
| C4 | Calibração de scores | C | P2 | contínuo | ⬜ pending |
| C5 | PWA install + offline claro | C | P2 | 4h | ⬜ pending |

**Fase activa:** C — Diferenciação  
**Critério de saída da Fase B:** homepage multi-desporto, URL sync, ≥20 unit tests scoring, CONTEXT.md actualizado, sitemap completo. ✅ **Concluída 2026-05-24**

---

## Fase A — Confiança (P0)

> **Porquê primeiro:** sem confiança, design e 167 spots não convertem. Bloqueador antes de marketing ou Product Hunt.  
> **Estimativa total:** 1 semana · **Deploy:** independente

---

### A1 — Dawn Patrol funcional

**Problema confirmado (2026-05-24):**
- `public/data/dawn-patrol.json` com data **2024-09-16**
- Slugs legacy (`coxos-ericeira`, `guincho-cascais`, `supertubos-peniche`) → 404 nos links
- Script `scripts/dawn-patrol.js` já usa slugs correctos (`coxos`, `guincho`, …)
- Workflow `.github/workflows/dawn-patrol.yml` existe (cron 05:00 UTC) mas o JSON nunca foi actualizado

**Tarefas:**

- [ ] Regenerar `public/data/dawn-patrol.json` via `node scripts/dawn-patrol.js` (requer `GEMINI_API_KEY` ou fallback básico)
- [ ] Validar que todos os slugs em `spots[]` e `topSpotSlug` existem em `src/lib/spots.ts`
- [ ] Em `DawnPatrolBanner.tsx`: esconder ou avisar se `data.date` > 24h (`"Briefing desactualizado"`)
- [ ] Em `DawnPatrolBanner.tsx`: validar slug antes do link; fallback para `/spots/` se inválido
- [ ] Verificar secrets GitHub: `GEMINI_API_KEY`, `GROQ`, `CEREBRAS` — workflow tem de fazer commit diário
- [ ] Disparar `workflow_dispatch` manualmente após merge e confirmar commit do bot

**Ficheiros:**
- `public/data/dawn-patrol.json`
- `scripts/dawn-patrol.js`
- `src/components/DawnPatrolBanner.tsx`
- `.github/workflows/dawn-patrol.yml`

**Critérios de aceitação:**
- [ ] JSON com data ≤ 24h
- [ ] Clicar “Ver Spot” no banner abre página válida (sem 404)
- [ ] Banner mostra aviso se briefing > 24h
- [ ] Workflow corre sem erro no Actions

---

### A2 — Copy honesto sobre frescura de dados

**Problema:** copy diz “tempo real” / “real-time” mas dados actualizam a cada **3 horas** (`update-data.yml`).

**Substituir por:**
- PT: *“Condições actualizadas a cada 3 horas”* / *“Actualizado às HH:MM”*
- EN: *“Conditions updated every 3 hours”* / *“Updated at HH:MM”*

**Tarefas:**

- [ ] Actualizar chaves em `src/lib/i18n.ts` (`hero.badge`, `hero.subtitle`, meta strings)
- [ ] Actualizar `src/components/SeoHead.tsx`, `src/app/[locale]/layout.tsx`, `src/app/layout.tsx`
- [ ] Actualizar meta de páginas: `page.tsx`, `spots/page.tsx`, `compare/page.tsx`, `favorites/page.tsx`, `about/page.tsx`, `modalidades/[slug]/page.tsx`, `spots/[slug]/page.tsx`
- [ ] Actualizar `public/manifest.json`, `src/components/layout/Footer.tsx`
- [ ] Actualizar `README.md` (PT + EN) — manter “atualização a cada 3h” como feature honesta
- [ ] Revisar H1 sr-only em `src/app/[locale]/page.tsx` (já tem status bar com hora — alinhar copy)

**Ficheiros afectados (grep `tempo real|real-time`):**
`i18n.ts`, `SeoHead.tsx`, `layout.tsx`, `[locale]/layout.tsx`, `[locale]/page.tsx`, `spots/page.tsx`, `compare/page.tsx`, `favorites/page.tsx`, `about/page.tsx`, `manifest.json`, `Footer.tsx`, `README.md`

**Critérios de aceitação:**
- [ ] Zero ocorrências de “tempo real” / “real-time” no UI e meta tags (excepto comentários/docs históricos)
- [ ] Status bar da homepage mantém hora de update
- [ ] About page explica cadência de 3h + fontes (Open-Meteo, IH)

---

### A3 — Badges DEMO / stale / fallback em toda a UI

**Problema:** `openmeteo.ts` devolve `source: 'mock'` silenciosamente; badge DEMO só existe em Compare e Favoritos.

**Tarefas:**

- [ ] Criar componente reutilizável `DataSourceBadge` (`real` | `mock` | `stale` | `cached`)
- [ ] Mostrar badge em:
  - [ ] `SpotDetailClient.tsx` (condições live + fallback client)
  - [ ] `SpotGridClient.tsx` / SpotCard quando condições vêm de mock ou `updatedAt` > 3h
  - [ ] Homepage ticker / hero “melhor spot” se dados stale
  - [ ] `CompareClient.tsx` e `FavoritesClient.tsx` (migrar para componente partilhado)
- [ ] Propagar `source` desde `conditions.json` se o pipeline passar a marcar origem (opcional nesta fase)
- [ ] Stale threshold: > 3h = amarelo “Dados de há X h”; > 12h = vermelho
- [ ] Nunca mostrar scores altos com mock sem badge visível

**Ficheiros:**
- `src/lib/openmeteo.ts`
- `src/components/ui/DataSourceBadge.tsx` (novo)
- `src/components/spots/SpotDetailClient.tsx`
- `src/components/spots/SpotGridClient.tsx`
- `src/components/compare/CompareClient.tsx`
- `src/components/favorites/FavoritesClient.tsx`

**Critérios de aceitação:**
- [ ] Simular falha Open-Meteo → badge DEMO visível no spot detail
- [ ] Dados com `updatedAt` antigo → badge stale
- [ ] Compare e Favoritos usam o mesmo componente

---

### A4 — Completar `compatibleSports`

**Estado actual (2026-05-24):** 117/167 preenchidos · **50 em falta**

**Críticos (heurística `TYPE_TO_SPORTS` falha ou sub-classifica):**
| Spot | type | Acção |
|------|------|-------|
| `foil-lagoa-albufeira` | foil | `['foil', 'kitesurf', 'sup']` |
| `alqueva` | wakeboard | `['wakeboard']` |
| `praia-rocha` | multisport | `['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup']` |
| `lagos-wakepark` | wakeboard | `['wakeboard']` |

**Restantes 46:** maioritariamente `type: surf` — heurística funciona, mas preencher explicitamente evita surpresas no scoring e filtros.

**Tarefas:**

- [ ] Preencher os 4 críticos acima em `src/lib/spots.ts`
- [ ] Script de validação: `node scripts/validate-spots.js` — falhar CI se spot sem `compatibleSports`
- [ ] (Opcional Fase A) Batch dos 46 surf-only restantes
- [ ] Remover TODO em `src/lib/sportRatings.ts` quando 167/167

**Critérios de aceitação:**
- [ ] 4 spots críticos com modalidades correctas no UI (SportSelector, filtros)
- [ ] Guincho / Lagoa Albufeira aparecem correctamente para kiter na homepage (após B1)

---

## Fase B — Coerência de produto (P1)

> **Depende de:** Fase A deployada  
> **Estimativa total:** 2–4 semanas

---

### B1 — Homepage multi-desporto

**Problema:** sort, ticker e “melhor spot” fixos em `surf` (`src/app/[locale]/page.tsx` L86–87, L183).

**Tarefas:**

- [ ] Sport preferido: `localStorage` key `ventu-preferred-sport` (já parcialmente usado no grid)
- [ ] Server sort default: sport preferido ou `'surf'` fallback
- [ ] Ticker mostra score do sport activo, não sempre surf
- [ ] Hero “Melhor spot hoje” usa melhor score entre `getCompatibleSports(spot)` ou sport seleccionado
- [ ] Sub-linha: “Top score · kitesurf” reflecte modalidade real

**Ficheiros:** `src/app/[locale]/page.tsx`, possivelmente extrair lógica para `src/lib/homepageSort.ts`

---

### B2 — URL sync nos filtros do grid

**Problema:** `SpotGridClient` lê `?sport=` e `?region=` mas não escreve quando o utilizador muda filtros.

**Tarefas:**

- [ ] Ao mudar sport/region: `history.replaceState` com `?sport=kitesurf&region=Algarve`
- [ ] Preservar locale no path (`/pt/?sport=…`)
- [ ] Partilhar link copiado reflecte filtros activos
- [ ] Teste E2E: mudar filtro → reload → filtro mantém-se

**Ficheiros:** `src/components/spots/SpotGridClient.tsx`, `tests/e2e/` (novo teste)

---

### B3 — Unit tests no scoring

**Problema:** zero tests em `sportScore.ts` — coração do produto desprotegido.

**Tarefas:**

- [ ] Configurar Vitest (ou Jest) — mínimo, sem E2E duplication
- [ ] 20–30 casos em `src/lib/__tests__/sportScore.test.ts`:
  - Guincho NNW offshore para kite
  - Nazaré swell grande → surf score alto, kite baixo
  - Lagoa flat + vento moderado → kite alto
  - Lake / flat spot → scores coerentes
  - `getCompatibleSports` fallback vs explicit
- [ ] Adicionar step `npm test` ao CI (`.github/workflows/`)

**Ficheiros:** `package.json`, `src/lib/sportScore.ts`, `src/lib/sportRatings.ts`

---

### B4 — Documentação actualizada

**Problema:** `docs/CONTEXT.md` desactualizado (Next 14, recharts, chat activo, 136 conditions).

**Tarefas:**

- [ ] Actualizar `docs/CONTEXT.md`: Next 16, stack actual, 167 spots, marés IH, chat removido, scoring files
- [ ] Actualizar contagem `compatibleSports` e estado pipelines
- [ ] README: secção “Roadmap” com link para este ficheiro
- [ ] Marcar items concluídos em `docs/PLANO-FASES.md` ou adicionar nota “superseded by ROADMAP.md”

---

### B5 — Sitemap & SEO completo

**Problema:** `public/sitemap.xml` estático omite `/about/`, `/sazonalidade/`, modalidades, artigos news.

**Tarefas:**

- [ ] Script `scripts/generate-sitemap.js` — corre no CI antes do build
- [ ] Incluir: todos os spots, modalidades, about, sazonalidade, compare, favorites, news articles
- [ ] `hreflang` pt/en onde aplicável
- [ ] JSON-LD por spot (Schema.org `SportsActivityLocation` ou `Beach`)

**Ficheiros:** `public/sitemap.xml` → gerado, `scripts/generate-sitemap.js`, `.github/workflows/deploy.yml`

---

## Fase C — Diferenciação (P2)

> **Horizonte:** 1–3 meses · **Não bloquear Fases A/B**

---

### C1 — Notícias PT

- [ ] RSS locais: Liga Surf Portugal, federações, Peniche/Nazaré, SAPO Desporto, etc.
- [ ] Filtrar/reponder com LLM para audiência PT
- [ ] Secção “Cena PT” distinct de Stab/IKSURF internacional

**Ref:** `scripts/update-news.js`, `docs/NEWS-SYSTEM.md`

---

### C2 — Alertas por email

- [ ] Supabase Edge Function + Resend (ou cron externo + webhook)
- [ ] Utilizador escolhe spot + modalidade + threshold score
- [ ] Sem contas complexas: magic link ou email-only subscription
- [ ] Limitação static export: alertas são **push out**, não in-app realtime

**Ref:** pedido #1 de utilizadores pós-“está on?”

---

### C3 — Loop comunidade → spots

- [ ] Feedback aprovado em `/admin/contributions/` → merge para `localTips` / `hazards` no spot
- [ ] PR automático ou script semanal que aplica contribuições validadas
- [ ] Atribuição “contribuído por @user” opcional

---

### C4 — Calibração de scores

- [ ] Formulário “condições reais vs previsão” (1 tap: melhor/pior/igual)
- [ ] Agregar feedback por spot + modalidade
- [ ] Ajustar pesos em `sportScore.ts` com dados empíricos (Nazaré ≠ Albufeira)

---

### C5 — PWA install + offline claro

- [ ] Prompt install after engagement
- [ ] Service worker: mensagem clara “Offline — dados de HH:MM”
- [ ] Ícones e `manifest.json` alinhados com copy honesto (pós A2)

---

## Fase D — Explicitamente adiado

| Item | Porquê adiar |
|------|--------------|
| Multi-modelo GFS/ECMWF | Windguru domina power users; complexidade alta |
| App nativa iOS/Android | PWA + SEO primeiro |
| Contas completas / sync favoritos | URL + localStorage + export suficiente por agora |
| Chat global | Removido com razão; só com analytics que justifiquem |
| Câmaras sem key Windy | Dependência externa; livecam embed manual nos top 5 spots (ver BACKLOG) |

---

## Métricas de sucesso

| Métrica | Actual (est.) | Meta pós-Fase A | Meta pós-Fase B |
|---------|---------------|-----------------|-----------------|
| Dawn Patrol freshness | 2024-09-16 | ≤ 24h | ≤ 24h |
| Copy “tempo real” | ~15 ficheiros | 0 | 0 |
| Mock sem badge | spot detail, grid | 0 surfaces | 0 |
| `compatibleSports` | 117/167 | 167/167 | 167/167 |
| Homepage sport bias | surf-only sort | — | sport preferido |
| Unit tests scoring | 0 | 0 | ≥ 20 casos ✅ |
| Sitemap URLs | parcial | parcial | completo ✅ |

---

## Notas de sessão

_Regista aqui decisões, bloqueios e o que ficou feito em cada sessão de trabalho._

### 2026-05-24 — Fase A concluída

- **A1:** `dawn-patrol.json` regenerado (2026-05-24, slugs correctos); banner com guard stale + validação de slugs; script com validação de slugs
- **A2:** copy “tempo real” substituído em i18n, meta, manifest, README, páginas
- **A3:** `DataSourceBadge` + `dataFreshness.ts`; integrado em SpotDetail, Compare, Favoritos, SpotDrawer
- **A4:** 4 spots críticos (`foil-lagoa-albufeira`, `alqueva`, `praia-rocha`, `lagos-wakepark`); `scripts/validate-spots.js`
- **Build:** `npm run build` verde
- **Próximo:** B1 (homepage multi-desporto)

### 2026-05-24 — Fase B concluída

- **B1:** `homepageSport.ts`, `HomepageFeatured.tsx` — ticker/hero/sort por modalidade preferida
- **B2:** `gridFilters.ts` — URL sync `?sport=` / `?region=`; teste E2E reload
- **B3:** Vitest + 20 testes em `src/lib/__tests__/sportScore.test.ts`; step `npm test` no CI
- **B4:** `docs/CONTEXT.md` actualizado; README com link roadmap; nota em `PLANO-FASES.md`
- **B5:** `generate-sitemap.js` expandido (about, sazonalidade, modalidades, news, hreflang); CI/deploy
- **Build:** `npm test` + `npm run build` verde
- **Próximo:** C1 (notícias PT) ou calibração scores

<!-- Template para sessões futuras:
### YYYY-MM-DD — Título curto
- Feito: ...
- Bloqueado: ...
- Próximo: ...
-->
