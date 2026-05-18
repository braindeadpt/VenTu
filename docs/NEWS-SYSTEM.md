# VenTu News System

## Architecture (4-Stage Pipeline)

```
Etapa 1 (RSS) ──┐
                 ├──> Etapa 3 (LLM aux) ──> Etapa 4 (Merge + Persist)
Etapa 2 (Data) ──┘
```

### Etapa 1 — RSS Fetch (Primary Source)

Fetches from confirmed-working RSS feeds, parses XML, applies spam filter.

**Feeds:**
| Feed | Category | Status |
|------|----------|--------|
| stabmag.com/feed/ | surf | ✅ |
| stabmag.com/category/news/feed/ | surf | ✅ |
| iksurfmag.com/feed/ | kitesurf | ✅ |
| iksurfmag.com/category/kitesurfing/feed/ | kitesurf | ✅ |
| iksurfmag.com/category/windsurfing/feed/ | windsurf | ✅ |
| surfd.com/feed/ | surf | ✅ |

**Deprecated feeds** (removed — 403/404/HTML): theinertia, surfline, windmag, thekitemag, magicseaweed

**Filters applied deterministically (zero LLM):**
- No title or URL → discard
- `publishedAt > 7 days ago` → discard
- Title/summary contains spam keyword → discard
- URL already in pipeline → dedup

### Etapa 2 — Event Detection (Factual, Zero LLM)

Reads `conditions.json` snapshot, applies hard thresholds:

| Event | Threshold | Category | Severity |
|-------|-----------|----------|----------|
| Big swell | waveHeight > 3.0m | big-wave / surf | info / warning |
| Strong wind | windSpeed > 25kt (converted) | kitesurf / windsurf / alert | info / warning / alert |
| Warm water | waterTemp > 22°C in >50% spots | general | info |
| Storm | windSpeed > 35kt in 3+ spots | safety | alert |

**TODO v2:** Fetch Open-Meteo hourly forecast for 72h/24h window detection.

### Etapa 3 — LLM Auxiliary (3 Specific Tasks)

LLM **never** researches or invents facts. Three narrow tasks:

1. **Categorise** — Assign modality category to RSS items where feed source is ambiguous
2. **Translate** — Bilingual (PT/EN) for every item
3. **Synthesise** — Generate short editorial content for detected events

Fallback chain: Gemini → Groq → Cerebras. Each task has a strict prompt with format constraints.

### Etapa 4 — Merge & Persist

Accumulates over time (no longer overwrite):
1. Load existing `news.json`
2. TTL: remove items > 7 days old
3. Dedup: by URL (for RSS) or title+sourceType (for data/LLM)
4. Merge new items
5. Sort by `publishedAt` descending
6. Cap at 100 items
7. Write

## Postura X — Proportional Honesty

- Feed mirrors real market: ~60% surf, ~15% kite, ~10% big wave, ~15% others
- No artificial balancing
- UI already supports category filtering (Lote B)

## Modalidade Investment

| Tier | Sports | Sources |
|------|--------|---------|
| Core (2-3 feeds) | surf, kitesurf, windsurf, big-wave | Dedicated RSS + keyword extraction |
| Standard (1 feed) | sup, foil, bodyboard | Tags in core feeds |
| Marginal (TODO) | wakeboard | No dedicated source yet |

## Anti-Spam

Deterministic keyword blacklist (`scripts/news/spam-filter.js`):
- 20 keywords covering promotions, affiliate, newsletter
- Case-insensitive partial match on title + summary
- Zero LLM cost

## Cron Schedule

GitHub Actions: `0 */3 * * *` (every 3 hours)
Uses secrets: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`
