# STORM-STUDY — avisos de tempestade: mapa, spot e alertas

Estudo encomendado 2026-09-29. Pergunta do owner: alertas para o utilizador,
alertas por spot, e indicação dinâmica no mapa de tempestade a aproximar-se /
iminente / em curso — com animação. Verificar primeiro se as integrações
recentes (NASA GIBS, fases A–C) já cobrem.

## Resposta à pergunta de cobertura

**As fases A–C e a NASA GIBS não cobrem isto.** GIBS é mosaico diário estático
(camada de contexto, não tempo real). O único infra dinâmico de tempestade que
existe é o radar IPMA — e só olha para trás.

## Inventário (o que existe hoje)

| Camada | Fonte | Estado | Lacuna para «tempestade» |
|---|---|---|---|
| Radar IPMA animado | `ipma.pt/.../imgs-radar.json` → `radar.json` + `radar/frames/*.png` (12 frames × 5 min, `L.ImageOverlay` carrossel com pause/prefs `radarPrefs`) | a funcionar | só passado — a aproximação é implícita, nunca declarada |
| Avisos IPMA | open-data API → `warnings.json` (15 ativos: Precipitação ×12, Vento ×3, todos amarelos; `spotWarnings` → 100 spots) | a funcionar | distrito + texto — **sem geometria no mapa** |
| MeteoAlarm fallback | `fetch-meteoalarm-warnings.js` | pronto (precisa `METEOGATE_API_KEY`) | cobre o mesmo produto que o IPMA serve |
| Avisos costeiros IH | `nav_warning_coastal` → `ih-coastal-warnings.json` (188 ativos, polígonos) | a funcionar | navegação, não meteorologia |
| Alertas de utilizador | `evaluate-alerts.js` + Supabase (`alert_subscriptions` legado + `user_alert_prefs`/favorites) | a funcionar | **só dispara com score ≥ limiar** — avisos entram como contexto («⚠️ Mar perigoso») mas nunca como gatilho |
| GIBS true-color / SST | NASA | a funcionar | mosaico diário — não é tracking |

## O que falta (decomposto)

### B1 — Estado de tempestade por spot (motor de derivação, build-time)

Sobre dados já existentes, sem API nova:

1. Descodificar o PNG do radar mais recente → eco de precipitação a ≤X km de
   cada spot → `{ state: 'limpo' | 'perto' | 'sobre', distKm }`.
2. Centróide do eco nas últimas 2–3 frames → vector de deslocamento →
   «a aproximar-se de W ~25 km/h» ou «a afastar-se» (etiquetado estimativa).
3. Cruzar com o nível IPMA do distrito do spot → estado oficial.
4. Artefacto `storm-state.json` → badge no spot page + contexto no mapa.

Dependência a verificar: decoder de imagem no pipeline (`sharp`/`jimp` —
o repo usa `sharp` para OG images; confirmar).

Esforço: médio. Valor: base honesta de tudo o resto.

### B2 — Polígonos de aviso no mapa

- Avisos IPMA já trazem `areaCode` (distrito); falta GeoJSON de distritos —
  asset **estático, baked uma vez** (fonte: DGTER/IPMA geojson oficial).
- Camada Leaflet `geoJson` pintada por nível (amarelo/laranja/vermelho) no
  grupo TEMPO do menu de camadas.
- Motion: **pulsação subtil só no vermelho** (regra de restrição — animação
  onde informa); `prefers-reduced-motion` → estático.

Esforço: baixo–médio. Valor: transforma chip de texto em zona visível =
«iminente/oficial».

### B3 — «A aproximar-se» real (nowcast)

Duas vias, uma decisão:

- **B3-A — advecção própria** (recomendado): correlação cruzada / block-
  matching entre as últimas frames do radar → campo de deslocamento →
  setas de movimento no mapa + ETA por spot («chuva chega ~30–45 min»).
  Médio–alto esforço, mas único, honesto e sem dependência externa.
- **B3-B — RainViewer** (tiles +30 min previsão → encaixa no carrossel
  existente): **licença limitada a uso pessoal/educativo/comunitário**
  (ver `docs/EXTERNAL-DATA.md`). Decisão legal do owner, não técnica.

### B4 — Alertas de aviso para o utilizador (gatilho independente)

`evaluate-alerts.js` já carrega `warnings.json` + costeiros para contexto.
Falta o gatilho:

- Favorito com aviso IPMA **≥ laranja** (nível por escolher na pref) ou aviso
  costeiro IH faixa §0 → email/Telegram **mesmo com score baixo**.
- Requer: flag `warn` em `user_alert_prefs` (migration pequena) + path novo no
  evaluator + template «⚠️ Aviso {nível} — {tipo} no teu {spot}» ×5 locales +
  respeitar digest/imediato e cooldowns existentes.
- Reusa: tokens, confirm/unsubscribe, rate-limit, dry-run — tudo existente.

Esforço: médio. Valor: fecha o pedido «alertas para o utilizador».

## Não recomendado

- **Lightning/Blitzortung** — tile server não-oficial, ToS cinzento. IPMA tem
  produto de descargas no site mas sem manifest público óbvio (probe 2026-09:
  `transf/descargas*`/`satelite*`/`meteosat*` → 404). Re-sondar se B3-A correr.
- Extrapolar o score para «perigo» — o score não mede segurança; a camada de
  tempestade é informativa e separada.
- Animação contínua em chrome/marquee — contra o design system.

## Sequência proposta

1. **B1 + B4** — partilham dados e fecham «alertas por spot e utilizador».
2. **B2** — a peça visual «iminente» no mapa.
3. **B3-A** — «a aproximar-se» com animação de campo de movimento.
4. (Opcional) lightning — re-sondar fontes.

## Honestidade

- ETA de advecção é estimativa → etiqueta «estimativa» + timestamp da frame.
- Estado «limpo» ≠ sem risco — manter disclaimers existentes.
- Se o radar IPMA degradar (já há monitor `ipma-radar-outage`), o estado
  de tempestade degrada para «dados indisponíveis» — nunca «tudo limpo».
