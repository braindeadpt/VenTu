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
| **F3b** (opcional) | Mapa **só** em `/diretorio` se faltar descoberta geo | ⬜ |
| **F4** Premium B2B | Destaque + Pro widget embed | ✅ MVP |

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
- [ ] Owner edita perfil após verificação
- Claim de seed JSON (já em F1 CTA)

**Ops:** re-correr [`supabase/supabase-directory.sql`](../supabase/supabase-directory.sql). Conta admin: `app_metadata.role = admin`.


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

**Decisão:** não pôr escolas no mapa explorar/scores. Descoberta = `/diretorio` + “Escolas perto” no spot.

**Opcional mais tarde (F3b):** mapa dedicado só na página do directório, sem misturar com condições.

---

## Fluxo claim (resumo)

```
OSM/curated → stub público (não verificado)
     → CTA “Reclama”
     → login + pedido (+ evidência opcional)
     → admin aprova
     → owner edita
     → (opcional) upgrade premium
```

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
