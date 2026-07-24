# Directório VenTu — Escolas, lojas e centros

> **Modelo:** comunidade sempre grátis · premium só B2B (escolas, lojas, autarquias, etc.)  
> **Criado:** 2026-07-24

## Objectivo

Directório nacional de escolas/lojas/kite centers no mapa e nas páginas de spot, com **claim** (“reclama o teu perfil”) e, mais tarde, tier pago (destaque, widget, auto-IG).

## Fases

| Fase | Entrega | Estado |
|------|---------|--------|
| **F1** Seed + stubs públicos | OSM → `directory.json`, página `/diretorio`, bloco no spot, CTA claim | 🟡 em curso |
| **F2** Claim + edição | SQL claims, verificação, owner edita perfil | ⬜ schema SQL pronto; UI aprovação admin TBD |
| **F3** Camada mapa | Toggle “Escolas” no mapa explorar (markers + clusters) | ⬜ |
| **F4** Premium B2B | Destaque, widget, leads, eventos da escola | ⬜ |

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

### F2 — Claim + edição

- Aprovar/rejeitar claim (admin `is_ventu_admin`).
- Owner edita nome, bio, desportos, contactos, spots servidos.
- Badge **Verificado**.
- Overrides em Supabase sobrepõem seed OSM (merge na leitura).

### F3 — Mapa

- Camada independente (não misturar com score clusters).
- Toggle no HUD explorar + página directório com mapa.
- Performance: mesmo cuidado mobile que spots (chunks, cluster default ON).

### F4 — Premium

- `tier: free | featured | pro`
- Destaque lista/mapa, widget embed, alertas white-label, analytics leves.

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
