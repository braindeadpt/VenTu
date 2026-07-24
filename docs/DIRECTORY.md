# Directório VenTu — Escolas, lojas e centros

> **Modelo:** comunidade sempre grátis · premium só B2B (escolas, lojas, autarquias, etc.)  
> **Criado:** 2026-07-24

## Objectivo

Directório nacional de escolas/lojas/kite centers em `/diretorio` e nas páginas de spot, com **claim** / **registo** e, mais tarde, tier pago (destaque, widget, auto-IG).

**Não** misturar escolas no mapa de condições (explorar/scores) — polui a leitura e o mobile.

## Fases

| Fase | Entrega | Estado |
|------|---------|--------|
| **F1** Seed + stubs públicos | AESP/OSM → `directory.json`, `/diretorio`, bloco no spot, CTA claim | ✅ |
| **F2** Claim + registo + verificação | SQL listings, form registo, admin aprova → Verificado | ✅ |
| **F3** Camada no mapa de condições | Toggle escolas no explorar | ⏭️ **saltada** (decisão 2026-07-24) |
| **F3b** (opcional) | Mapa **só** em `/diretorio` | ✅ |
| **F4** Premium B2B | Destaque + Pro widget embed | ✅ MVP |
| **F2b** Owner edita | `/diretorio/gerir` + admin claims | ✅ |

---

### F1 — Seed + stubs (esta entrega)

1. **Modelo** `DirectoryEntry` (kind, sports, lat/lon, spotIds, source).
2. **Pipeline** `npm run directory:fetch` — Overpass (Portugal) + attach aos spots VenTu por distância.
3. **Dados** `public/data/directory.json` (gerado; commitável).
4. **UI**
   - `/[locale]/diretorio/` — lista filtrável (kind / região / desporto).
   - Spot detail — “Escolas e lojas perto” + link claim.
5. **Claim CTA** — login → pedido `pending` em Supabase (`directory_claims`); admin aprova na F2.
6. SQL: `supabase/supabase-directory.sql` (correr no Dashboard).

**Critério de saída:** build verde; ≥1 página listagem; ≥1 spot com escolas próximas se houver seed; CTA claim sem crash.

### F2 — Claim + registo + verificação

- [x] `directory_listings` — registo novo (público já, `verified=false`)
- [x] Form em `/diretorio` («A tua escola não está?»)
- [x] Admin `/admin/diretorio` — aprovar → `verified=true`
- [x] Owner edita perfil após verificação (`/diretorio/gerir`)
- [x] Admin aprova claims de seed → `directory_profiles` com owner
- Claim de seed JSON (já em F1 CTA)

**Ops:** re-correr [`supabase/supabase-directory.sql`](../supabase/supabase-directory.sql) (RLS owner update + triggers). Conta admin: `app_metadata.role = admin`.

### Segurança e integridade (must-run no Dashboard)

Static export + Supabase client-side — defesa em profundidade no campo `website` e nos writes de claim:

| Camada | O quê |
|--------|--------|
| **Render** | `safeExternalUrl` (`src/lib/safeUrl.ts`) — só `http:`/`https:`; esconde o link se inválido (detalhe + card). `safeTelHref` para `tel:`. |
| **SQL** | CHECK `website` só `NULL` ou `^https?://` em `directory_listings` / `directory_profiles`. Caps: website 300, phone 40, email 160, address 300; bio 2000, display_name 120. |
| **Form** | Registo + gerir validam com `safeExternalUrl` e `DIRECTORY_FIELD_LIMITS`; guardam URL normalizada. |
| **Claims** | `approve_directory_claim` RPC (transaccional) — claim + profile + listing `sub-*` na mesma função; `approveDirectoryClaim` chama `sb.rpc(...)`. |

**Ops (SQL Editor)** — se as tabelas já existem, corre os blocos comentados em `supabase-directory.sql`:

1. Website http CHECK (+ limpar rows `javascript:` se houver).
2. Length CHECKs (`*_len_check`).
3. `CREATE OR REPLACE FUNCTION public.approve_directory_claim` + `REVOKE`/`GRANT`.

Limites de form: `src/lib/directoryFieldLimits.ts`.

### Embed widget (F4 Pro)

- URL: `/embed/spot/{slug}/?school=…&lang=pt|en`
- Compacto (altura pelo conteúdo) — `data-embed-widget` + CSS em `globals.css` (body sem `min-h-screen` no iframe).
- **Footgun hosting:** `public/_headers` tem `X-Frame-Options: DENY` no catch-all (ignorado no GitHub Pages). Em Netlify/Cloudflare, o override `/embed/*` com `frame-ancestors *` **tem** de permanecer — senão o widget B2B deixa de iframear.


### F4 — Premium B2B ✅ MVP

| Tier | O que ganha |
|------|-------------|
| **free** | Listagem + claim/registo |
| **featured** | Ordenação no topo + badge «Destaque» |
| **pro** | featured + **widget embed** (`/embed/spot/{slug}/?school=…`) |

- Coluna `directory_listings.tier` (+ `directory_profiles.tier` para seed)
- Admin `/admin/diretorio` — selector de tier + snippet iframe
- Riders nunca pagam

**Ops:** re-correr `supabase-directory.sql` (ADD COLUMN tier).

### F3 — Mapa de condições (saltada)

**Decisão:** não pôr escolas no mapa explorar/scores. Descoberta = `/diretorio` (lista + mapa) + “Escolas perto” no spot.

### F3b — Mapa só em `/diretorio` ✅

- Toggle Lista / Mapa em [`DirectoryClient`](../src/components/directory/DirectoryClient.tsx)
- [`DirectoryMap`](../src/components/directory/DirectoryMap.tsx) — Leaflet + clusters, pins com filtros activos
- **Não** no mapa de condições (explorar/scores)

---

## Fluxo claim (resumo)

```
OSM/curated → stub público (não verificado)
     → CTA “Reclama”
     → login + pedido (+ evidência opcional)
     → admin aprova
     → owner edita (`/diretorio/gerir`)
     → (opcional) upgrade premium
```

## Owner edit

| Origem | Tabela | Onde edita |
|--------|--------|------------|
| Registo novo | `directory_listings` | `/diretorio/gerir` (sempre que és owner) |
| Claim de seed | `directory_profiles` overlay | idem, após admin aprovar claim |

Owner **não** altera `verified` / `tier` (trigger SQL).
## Fontes de dados

| Fonte | Uso |
|-------|-----|
| **AESP associados** (`aesp-associados.json`) | Seed principal de escolas de surf reais (~130) |
| OpenStreetMap / Overpass | Complemento (cobertura PT fraca para `shop=surf`) |
| Curado (`curated.json`) | Corrigir / acrescentar à mão |
| Claim + edição | Fonte de verdade pós-verificação |

**Nota:** 74 stubs “Escolas / lojas — {spot}” não contam como escolas reais. O volume honesto vem da AESP + OSM + claims. Kite centers / lojas ainda vão crescer (listas IKO, OSM, community submit).


## Scripts

- `directory:fetch` — Overpass + attach + write JSON
- `directory:validate` — sanity checks (coords PT, ids únicos)

## Notas

- Não confundir com `Spot.facilities` (“Escola surf” = tag, não entidade).
- Utilizadores normais nunca pagam.
- Moderação humana no início dos claims (volume PT é gerível).
