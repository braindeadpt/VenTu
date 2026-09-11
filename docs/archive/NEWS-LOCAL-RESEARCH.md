# Notícias locais (PT) — estudo e decisões

> **Última revisão:** 2026-05-25  
> **Relacionado:** [`NEWS-SYSTEM.md`](./NEWS-SYSTEM.md), [`ROADMAP.md`](./ROADMAP.md) (C1, E3)

## Contexto

Foi discutido melhorar o **fluxo de notícias** com foco em conteúdo **português** e **por modalidade**, sem inventar artigos nem depender de embeds frágeis (lição das livecams).

Este documento resume o que já foi **pesquisado**, o que **funciona em produção**, o que **falhou**, e a estratégia mais funcional daqui para a frente.

---

## Arquitectura actual (já implementada)

Pipeline em 4 etapas (`scripts/update-news.js`):

| Etapa | Ficheiro | Papel |
|-------|----------|--------|
| 1 | `scripts/news/fetch-rss.js` | RSS → stubs + spam filter |
| 2 | `scripts/news/detect-events.js` | Eventos a partir de `conditions.json` + `forecasts.json` (185 spots PT) |
| 3 | `scripts/news/llm-tasks.js` | Categorizar, traduzir PT/EN, sintetizar eventos |
| 4 | `scripts/news/merge-persist.js` | Merge, TTL 7 dias, dedup, cap 100 |

**Postura editorial** (`NEWS-SYSTEM.md` — «Postura X»): não forçar equilíbrio artificial entre modalidades; o mercado RSS é ~60% surf; a UI filtra por desporto.

---

## Fontes RSS — resultados dos testes

### ✅ Portugal (Cena PT) — em produção

| Fonte | URL | Estado (2026-05-25) | Notas |
|-------|-----|---------------------|--------|
| ANS | `ansurfistas.com/feed/` | 200, ~10 items | Competições, Liga MEO, Ericeira |
| Notícias do Mar | `noticiasdomar.pt/feed/` | 200, ~15 items | Geral marítimo/surf PT |
| FPS | `fps.pt/feed/` | 200, ~10 items | Federação, surf nacional |

Configuradas em `scripts/news/fetch-rss.js` com `sourceRegion: 'pt'` e tag `cena-pt`.

### ❌ Testadas e descartadas (E3 / sessões anteriores)

| Fonte | Motivo |
|-------|--------|
| Liga Surf (`ligasurf.pt`) | Domínio inacessível / sem RSS estável |
| SAPO Desporto | Feed inacessível no CI (timeout/bloqueio) |
| Fed Surf (URL alternativa `/noticias/feed/`) | HTML, não RSS |
| Surftotal (`/feed`, `/rss`, etc.) | 404 em todos os caminhos comuns |
| Surfline, Magicseaweed, The Inertia, Windmag, TheKiteMag | 403/404/HTML (lista em `NEWS-SYSTEM.md`) |
| portuguesesurf.com/feed | 200 mas 0 items parseáveis |

**Conclusão:** não há «mais um RSS PT mágico» fácil. Os 3 feeds actuais são o núcleo fiável do jornalismo nacional.

### Repetir testes

```bash
node scripts/news/probe-feeds.js
```

---

## «Local» — três camadas (da mais fiável à mais difícil)

### 1. Jornalismo PT (RSS) — **feito**

Notícias reais sobre Ericeira, Liga MEO, Nazaré, etc. Filtro UI **Cena PT** (`sourceRegion === 'pt'`).

Melhorias UX já aplicadas:
- `/pt/news/` abre com **Cena PT** por defeito
- Pills por modalidade + URL `?category=surf`
- Keywords costa PT em `category-keywords.js` (Peniche, Guincho, Algarve, …)

### 2. Eventos VenTu (dados próprios) — **feito (E3)**

Gerados a partir dos **185 spots** — isto é o conteúdo mais «local» possível:

- Ondas ≥3m **agora** ou **previsão 72h**
- Vento ≥25kt **agora** ou **previsão 24h**
- Categoria por desporto (surf / kite / wind / big-wave / safety)
- `sourceRegion: pt` + tags `cena-pt`, `portugal`

Não substitui reportagem, mas responde «o que vai acontecer na costa portuguesa» de forma factual (zero LLM na detecção).

### 3. Regional (Norte, Algarve, …) — **não viável por RSS**

Não existem feeds por macro-região. Alternativas:

| Abordagem | Viabilidade |
|-----------|-------------|
| Filtrar títulos por keyword regional | Parcial (já nas keywords) |
| Secção «notícias do spot» com tags de slug | **Recomendado** — próximo passo |
| Scrape Surftotal/MEO | Frágil + legalmente cinzento (como livecams) |

---

## Modalidades de nicho (bodyboard, wakeboard, foil, SUP)

**Pesquisa 2026-05-25** (`npm run news:probe-feeds` + varredura de `news.json`):

| Modalidade | Itens em `news.json` (antes) | Feeds RSS dedicados |
|------------|------------------------------|---------------------|
| bodyboard | 0 | Nenhum estável (APB, Bodyboard Mag, tags ANS → 404/vazio) |
| wakeboard | 0 | ✅ **Alliance Wake** (`alliancewake.com/feed/`, ~10 items) — adicionado ao pipeline |
| foil | ~1 (kitefoil mal classificado) | Sem feed; keywords `kitefoil`, `wingfoil`, etc. |
| SUP / paddle | 0 | SUP Connect, Total SUP, Standup Journal → 404/vazio |

**Causa:** os feeds PT (ANS, Notícias do Mar, FPS) e internacionais (Stab, IKSURF, SURFD) são quase só **surf/kite/wind**. Não é bug do filtro UI — **falta conteúdo na origem**.

**Correcções aplicadas:**

- Feed **Alliance Wake** → categoria `wakeboard`
- Keywords alargadas (`category-keywords.js`) + LLM só quando keywords não detectam desporto específico
- Próximo `news:generate` (CI 3h) passa a incluir wakeboard

**bodyboard / SUP:** continuam raros até aparecer feed PT ou artigos com essas palavras nos RSS actuais. Filtro UI já existe; utilizador vê lista vazia com mensagem de «sem resultados».

---

## O que ainda NÃO está feito (backlog notícias)

| Item | Prioridade | Esforço |
|------|------------|---------|
| Bloco «Notícias relacionadas» no detalhe do spot | ✅ | `SpotRelatedNews.tsx` + `getRelatedNewsForSpot()` |
| Faixa «Cena PT» na homepage (3 últimas PT) | Média | ~1h |
| Evitar tradução LLM em artigos já PT (`sourceRegion: pt`) | Média | ~1h |
| Mais feeds PT | Baixa | Bloqueado por disponibilidade |
| LLM reponder títulos ambíguos | Baixa | Opcional, custo API |
| Notícias por macro-região na UI | Baixa | Só com keywords, sem feed dedicado |

---

## Estratégia recomendada (mais funcional)

**Não tentar replicar Surfline/Surftotal em RSS.** O diferencial VenTu é:

1. **Cena PT** = 3 RSS + eventos de condições/previsão PT  
2. **Por desporto** = categorias + eventos com `category` correcto  
3. **Por spot** (próximo) = filtrar `news.json` onde `tags` contém slug ou texto menciona o spot/região  

Fluxo ideal para o utilizador PT:

```
Homepage → 3 headlines Cena PT
     ↓
/pt/news/?region=pt (default) → filtro surf/kite
     ↓
/pt/spots/ericeira/ → «Notícias: Ericeira Pro, …» + condições
```

Internacional mantém-se em segundo plano (filtro **Internacional**), alinhado com a Postura X.

---

## Histórico de decisões (sessões)

| Data | Decisão |
|------|---------|
| 2026-05-24 | C1: ANS + Notícias do Mar + FPS; filtro Cena PT |
| 2026-05-25 | E3: eventos forecast 72h/24h; wakeboard keywords |
| 2026-05-25 | Mais RSS PT (Liga/SAPO) → descartados após teste |
| 2026-05-25 | UI default Cena PT; eventos com `sourceRegion: pt` |

---

## Referências no repo

- Pipeline: `scripts/update-news.js`
- Feeds: `scripts/news/fetch-rss.js`
- UI: `src/components/news/NewsArchiveClient.tsx`, `NewsFilters.tsx`
- Tipos: `sourceRegion`, `category` em `src/types/index.ts`
