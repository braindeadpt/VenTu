# Auditoria VenTu — 2026-09-22

**Âmbito:** ~132k LOC (TS/TSX/JS), 1810 ficheiros — `src/`, `scripts/`, `worker/`,
`supabase/`, `.github/workflows/`, `tests/`, configs e documentação.
**Commit auditado:** `c3c3d0e`. **Código de correcção:** commits de 2026-09-22/23
(referidos em cada achado).

> **Versão pública.** Os detalhes de exploração (payloads, pedidos concretos) e
> os resultados das sondagens a produção foram **omitidos deliberadamente** —
> ficam registados no arquivo interno do mantenedor. Tudo o que aqui está
> descreve classes de problema, localização no código e a correcção aplicada.
> O backlog vivo continua em [`../BACKLOG.md`](../BACKLOG.md).

---

## 1. Metodologia

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (strict) | ✅ 0 erros |
| `npm run lint` (ESLint 9 + next/core-web-vitals) | ✅ 0 erros |
| `npm test` (Vitest) | ✅ 1624/1624 testes em 184 ficheiros |
| `npm run spots:validate` | ✅ 185 spots, slugs ASCII únicos |
| Paridade de ficheiros de teste vs `vitest.config.ts` | ✅ 0 ficheiros órfãos |
| Specs `test:e2e:core` vs ficheiros | ✅ todos existem |
| Varredura de segredos hardcodados | ✅ nenhum |
| Chaves server-only (`GEMINI/RESEND/SERVICE_ROLE/IH/TELEGRAM`) em `src/` | ✅ zero referências (sem fuga ao bundle) |
| JSON commitado em `public/data` | ✅ todos parseáveis |
| `package.json` scripts → ficheiros existentes | ✅ nenhum script partido |
| Revisão manual: RLS/SQL, auth, workflows, worker, i18n, componentes, orçamentos | ver achados |

**Veredicto:** saúde acima da média — guards de CI densos, testes extensos, RLS
bem desenhado, Actions pinadas por SHA. Ficaram **2 problemas altos**, **8 médios**
e uma lista de lixo/drift.

---

## 2. Comprovadamente bom (não corrigir)

- **Type-safety:** `strict` sem `ignoreBuildErrors`; o build type-checka `src/` no CI.
- **Segredos:** nenhum hardcodado; os exemplos `.env` usam placeholders inofensivos.
- **Supabase:** RLS em todas as tabelas; `SECURITY DEFINER` com `SET search_path` +
  `REVOKE ... FROM PUBLIC`; writes fechados a RPCs; admin por `app_metadata`
  (`supabase-contributions-admin-rls.sql`); páginas admin/conta `noindex`.
- **Actions:** todas as `uses:` pinadas por SHA; `permissions` mínimas; **sem**
  `pull_request_target`; sem interpolação de contextos não-confiáveis em `run:`;
  `deploy.yml` com retry e falha explícita.
- **Auth:** callback com redirect fixo (sem open redirect) + cleanup/timeout.
- **XSS no frontend:** resumos como *text children* do React; `safeExternalUrl()`
  para links externos; `escapeHtml` próprio nos emails.
- **Worker:** validação de bounds lat/lon, rate-limit por IP, inputs saneados.
- **Scripts:** todos os `fetch` com `AbortSignal`/timeout; nenhum log de segredos.
- **Mapa:** guards de teardown do Leaflet com testes dedicados + e2e `map-unmount-race`.
- **i18n:** teste de 421 linhas (keys em falta, fallback EN, valores vazios).
- **Fusos horários:** `ForecastTable` usa chaves de hora **Lisboa**; datas âncora em
  `T12:00:00` evitam desvio de dia.
- **`public/_headers`** com o footgun `/embed/*` documentado + guarda no CI.

---

## 3. Achados ALTOS

### H1 — XSS armazenado via JSON-LD de notícias ✅ fechado

**Onde:** `src/app/[locale]/news/[slug]/page.tsx`, `src/components/SeoHead.tsx`,
`src/app/[locale]/layout.tsx`.

O JSON-LD era injectado com `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`.
`JSON.stringify` **não escapa `<`**: um título/descrição com markup fechava a tag
`<script>` do bloco. O caminho existia mesmo com o strip de tags do RSS, porque a
ingestão descodificava entidades **depois** do strip — texto escapado podia voltar
ao estado de markup.

**Impacto:** XSS persistente no domínio, a exigir controlo de um dos feeds RSS
ingeridos, em qualquer das 5 línguas.

**Correcção (defesa em profundidade, commit `ec901ae`/`6a97d93`):**
1. **Renderização:** helper `src/lib/jsonLd.ts` → `jsonLdHtml()` escapa `&`, `<` e `>`
   como escapes unicode JSON (recomendação do guia JSON-LD do Next.js), aplicado nos
   3 sítios. O output continua a fazer `JSON.parse` válido (os search engines lêem).
2. **Ingestão:** `scripts/news/fetch-rss.js` faz strip → decode → **strip de novo**,
   e a sanitização partilhada (`scripts/lib/sanitizeText.js`) garante que nenhum
   `<`/`>` sai da função.
3. **Testes:** `src/lib/__tests__/jsonLd.test.ts` (4) + `fetchRss.test.js` (+4,
   incl. feed inteiro hostil) + `sanitizeText.test.js` (8, com os bypasses clássicos).

### H2 — Abuso do relay de email nos alertas ✅ fechado

**Onde:** `supabase/supabase-alerts*.sql`, `scripts/evaluate-alerts.js`.

A RPC pública de subscrição tinha rate-limit apenas por `client_id` (gerado no
cliente, trivialmente rotável) e **sem unicidade por email**; o evaluator mandava
email de confirmação **por linha**, não por endereço. Combinado, permitia usar o
relay de `alerts@ventu.surf` para enviar uma rajada de emails a terceiros.

**Impacto:** assédio a terceiros, queima de reputação/deliverabilidade do domínio
e consumo de quota do provider de email.

**Correcção (commits `a9eb176`/`a9eb176*`, SQL aplicado em produção):**
1. **RPC fraca removida do caminho de escrita:** os ficheiros passam apenas a
   `DROP` da assinatura antiga (fail-closed); o único `subscribe_alert` vivo é o
   endurecido (rate-limit **por IP**, token gerado no servidor, tecto de pendentes
   por email, unicidade enquanto activo, grants anon revogados).
2. **Dedup por endereço no evaluator:** cooldown de 24 h sobre o envio mais recente
   de **todas** as linhas do endereço + tecto por corrida.
3. **Docs:** `docs/ALERTS.md` passa a exigir a ordem de aplicação
   (`rate-limit-common` → `alerts` → `harden-legacy`); `supabase/README.md` marca
   o ficheiro obsoleto.
4. **Testes:** `evaluateAlertsVerification.test.js` (colapso de várias linhas numa
   vítima, cooldown partilhado, tecto, e-mails em maiúsculas/minúsculas).

---

## 4. Achados MÉDIOS

| # | Achado | Estado |
|---|---|---|
| **M1** | `tests/e2e/**` e `worker/**` nunca eram type-checkados (excluídos do `tsconfig`, sem step `tsc` nos workflows) | ✅ **fechado** — step de typecheck no CI + `tests/e2e/tsconfig.json` |
| **M2** | Script `dawn-patrol:dev` partido (`dotenv` ausente + `node -e` noutro processo) | ✅ **fechado** — `node --env-file-if-exists=.env` |
| **M3** | README dizia «37 spots» com livecams (realidade: 119 spots / 120 câmaras) | ✅ **fechado** — números medidos em PT/EN |
| **M4** | 14 de 54 specs Playwright só corriam manualmente | 🔧 em curso — migração para as gates do CI |
| **M5** | i18n a meio: ternários `isPt ? … : …` hardcoded em vez de `getTranslation`; es/de/fr herdam copy EN com 5 hreflangs no sitemap | 🔧 em curso — fatias por componente; `MIGRATED_GLOBS` cresce |
| **M6** | `evaluate-alerts` sem paginação (PostgREST trunca silenciosamente) | ✅ **fechado** — paginação por `Range` + falha ruidosa |
| **M7** | Validador de livecams só verificava ASCII/duplicados, não *membership* | ✅ **fechado** — guarda de membership + allowlist documentada para câmaras regionais standalone |
| **M8** | Crescimento do histórico: `git add -f public/data/` commita ~2×/hora (24 MB versionados, incl. frames de radar) | ⏳ backlog — mover volumes para artefactos/release |

---

## 5. Achados BAIXOS

| # | Achado | Estado |
|---|---|---|
| 1 | Keys mortas nas traduções es/de/fr (sem guard inverso) | ✅ guarda inversa no teste de i18n |
| 2 | Mojibake (UTF-8 lido como Latin-1) em comentários de configs/docs | 🔧 parcial (restam 2 docs) |
| 3 | `package-lock.json` instável entre `npm install` | ⏳ backlog |
| 4 | `public/og-image.png` gerado e trackeado (diff binário a cada build) | ✅ build determinístico |
| 5 | `docs/CONTEXT.md` contradizia-se na cadência do pipeline | ✅ harmonizado |
| 6 | `.env.example` com passos numerados duplicados | ✅ renumerado |
| 7 | Script órfão de screenshots | ✅ documentado/removido |
| 8 | Definições SQL duplicadas com signatures diferentes (drift conforme ordem) | 🔧 em curso — migrações ordenadas |
| 9 | Timers/setState sem cleanup no unmount | ✅ cleanup adicionado |
| 10 | `catch {}` vazios sem comentário | ✅ comentados |
| 11 | Higiene do remoto: branches stale, `mockups/`, `docs/archive/` | ✅ limpo (ver §7) |
| 12 | Worker devolvia `Access-Control-Allow-Origin: ''` com `ALLOWED_ORIGINS` vazio | ✅ CORS endurecido |

---

## 6. Achados descobertos na implementação

Ao reparar a gate de E2E (vermelha há vários runs) apareceram dois problemas que a
auditoria estática não apanhava:

### F1 — Rodapé desktop inteiramente colapsado em motores modernos ✅

O CSS forçava `.footer-section-body { display: block !important }` em `md+` para
vencer o `<details>` fechado, mas o Chromium 131+ / Firefox 130+ / Safari 18.2+
escondem o conteúdo de um `<details>` fechado no pseudo-elemento `::details-content`
(`content-visibility: hidden` + `block-size: 0`) — o `display` dos filhos já não lá
chega. Em ≥768 px o rodapé mostrava **só os títulos das colunas**: zero links e
nenhuma das cadeias de atribuição obrigatórias (também ausentes da árvore de
acessibilidade).

**Correcção:** repôr o pseudo-elemento no media query `md+`
(`content-visibility: visible; block-size: auto; display: block`); motores sem
`::details-content` ignoram a regra e ficam com o override antigo.

### F2 — Copy dos badges de score desalinhada dos specs ✅

Os rótulos passaram a «Onda · só previsão» / «Vento · só previsão» (EN
«Wave · forecast only») na unificação dos `ProvenanceChip`, mas os specs exigiam o
texto exacto antigo.

### F3 — UX audit mobile com semântica de desktop ✅

O `CollapsibleSection` põe o título no `<summary>` (não é *heading*) e só monta o
corpo ao abrir — em mobile os headings internos não existem no estado fechado; e o
toggle de cluster vive nos extras do *sheet*, não flutuante. Os testes passaram a
abrir os accordions e a usar o helper de UI documentado.

### F4 — Flake dos marcadores do mapa (cluster forçado em mobile) ✅

Os artefactos do CI mostraram o mapa em **cluster**, sem um único marcador
individual: em mobile a app força o cluster no arranque e ignora o `localStorage`
em que os specs confiavam — passavam por corrida e, no runner, o pick esperava até
ao timeout. Passaram a desfazer o cluster pela UI (`showAllMapMarkers`, o caminho
já documentado no helper), com pick pelo centro no viewport, espera de estabilidade
e diagnóstico em vez de timeout mudo.

---

## 7. Higiene do repositório e do GitHub

| Item | Antes | Depois |
|---|---|---|
| Dependabot alerts / security updates | desligados | ✅ activos |
| Private vulnerability reporting | desligado | ✅ activo (+ `SECURITY.md`) |
| Protecção de `main` | sem protecção | ✅ ruleset (sem force-push, sem remoção) |
| Retenção de artefactos de Actions | 90 dias | ✅ 7 dias (+ purga dos antigos) |
| Branches mortas | 6 `cursor/*` | ✅ apagadas |
| README (livecams) | «37 spots» | ✅ 119 spots / 120 câmaras |
| Perfil comunitário | 57% | ✅ **100%** (+ PR/issue templates, CoC, SECURITY) |
| **CodeQL (code scanning)** | inexistente | ✅ activo, **0 alertas** |
| Wiki/Projects | ligados | ✅ desligados |
| Scratch versionado | `mockups/` + `docs/archive/` (7,7 MB) | ✅ fora do git |

O CodeQL, na primeira análise, levantou 11 alertas (10 altos) em scripts e testes —
sanitização de HTML do RSS/emails (dupla-descodificação e strip incompleto) e
comparações de URL por substring. Todos corrigidos com uma lib partilhada
(`scripts/lib/sanitizeText.js`), verificação de hostname e testes de regressão.

---

## 8. Prioridades restantes

1. **M4/M5** (specs no CI; migração i18n por fatias) e **M8** (footprint do
   histórico: volumes de dados fora do git).
2. **L3** (lockfile estável) e os restos de mojibake em dois docs.
3. Backlog vivo e detalhado: [`../BACKLOG.md`](../BACKLOG.md) e
   [`../ROADMAP.md`](../ROADMAP.md).

---

*Auditoria estática + execução local (tsc/eslint/vitest/validadores) sobre o commit
`c3c3d0e`, com acompanhamento até 2026-09-23 (H1/H2, reparação da gate de CI, CodeQL
e higiene do repositório).*
