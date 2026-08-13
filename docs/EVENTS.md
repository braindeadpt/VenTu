# VenTu — Community events

> Curated festivals, competitions, clinics and gatherings.  
> **Not** weather “events” from `detect-events.js` (those go into the news RSS pipeline).

Events appear **inside the news feed** (upcoming first) and as a thin strip on matching **spot pages**. There is **no** standalone `/eventos` calendar — an empty calendar in January looks like a dead product.

---

## File of truth

| Path | Role |
|------|------|
| `public/data/events.json` | JSON **array** of events (hand-curated) |
| `public/images/events/` | Optional images referenced by `image` |
| `src/types/events.ts` | TypeScript schema |
| `src/lib/events.ts` | Parse, Lisbon date rules, upcoming / per-spot helpers (browser-safe) |
| `src/lib/load-events.ts` | Server-only `loadEvents()` from `public/data/events.json` |
| `scripts/events/validate.ts` | Strict validation before commit |

**Never invent events.** If you do not have a real `startDate` and `location`, do not add the row. Invalid rows are skipped at render time and fail `events:validate`.

---

## Schema (every field)

```jsonc
{
  "id": "kebab-slug-unico",          // required, unique
  "title": "...",                    // required, PT-PT
  "titleEn": "...",                  // required, English
  "summary": "...",                  // required, 1–2 sentences PT
  "summaryEn": "...",                // required, 1–2 sentences EN
  "startDate": "2026-08-15",         // required, ISO YYYY-MM-DD
  "endDate": "2026-08-16",           // optional; multi-day last day (inclusive)
  "startTime": "09:00",              // optional, HH:MM (Lisbon wall clock, display only)
  "location": "Praia do Guincho, Cascais", // required, human-readable
  "spotIds": ["guincho"],            // array; each id MUST exist in src/lib/spots.ts
  "region": "Cascais",               // optional
  "sport": "kitesurf",               // required: surf|kitesurf|windsurf|sup|foil|wakeboard|bodyboard|multi
  "kind": "competition",             // required: competition|clinic|festival|gathering|other
  "organizer": "Nome do organizador", // optional
  "url": "https://...",              // optional; http(s) only (registration / official)
  "image": "/images/events/xxx.jpg", // optional; file must exist under public/
  "free": true                       // optional boolean
}
```

### Date rules (Europe/Lisbon)

- Compare calendar days with `Intl.DateTimeFormat` + `timeZone: 'Europe/Lisbon'`.
- **Never** use `toISOString().slice(0, 10)` for “today” — that is UTC and already bit us on DailyStreak-style bugs.
- An event stays **upcoming / ongoing** until the **end** of `endDate` (or `startDate` if no `endDate`), inclusive.  
  Example: `endDate: "2026-08-09"` is still shown all day on 9 Aug Lisbon; gone on 10 Aug Lisbon.
- `endDate` must be `>= startDate` when present.

### spotIds

- Use real `id` values from `src/lib/spots.ts` (often same as slug, not always).
- Spot page strip = **explicit** membership in `spotIds` only. No region / distance inference.
- Empty `spotIds` is allowed (shows in the news feed only).

### Images

1. Put the file in `public/images/events/` (e.g. `nortada-kite-fest.jpg`).
2. Set `"image": "/images/events/nortada-kite-fest.jpg"`.
3. Run validation — missing files fail.
4. UI uses `next/image` with `unoptimized`. If the file is missing at runtime, the card hides the image (no broken icon).

---

## Example (docs only — do **not** paste into `events.json` unless real)

```json
{
  "id": "esposende-nortada-kite-fest-2026",
  "title": "Esposende Nortada Kite Fest",
  "titleEn": "Esposende Nortada Kite Fest",
  "summary": "Adiado de agosto por falta de vento: 25–27 set na foz do Cávado. Provas, DJ e concerto. Público gratuito.",
  "summaryEn": "Postponed from August due to no wind: 25–27 Sep at the Cávado mouth. Races, DJs and live show. Free for the public.",
  "startDate": "2026-09-25",
  "endDate": "2026-09-27",
  "location": "Parque Radical / foz do Cávado, Esposende",
  "spotIds": ["esposende", "foil-esposende-piscinas"],
  "region": "Esposende",
  "sport": "kitesurf",
  "kind": "festival",
  "organizer": "Nortada",
  "url": "https://nortadakitefest.pt/",
  "free": true
}
```

Seed file ships as `[]`. Add real rows only when confirmed.

---

## How to add an event (checklist for humans / LLM)

1. Confirm dates, place, sport, organizer, and official URL from a primary source.
2. Look up spot `id`s in `src/lib/spots.ts` — copy exactly; do not invent slugs.
3. Append one object to the array in `public/data/events.json`.
4. Optional: add image under `public/images/events/` and set `image`.
5. Run:

```bash
npm run events:validate
# or
npx tsx scripts/events/validate.ts
```

6. Fix every reported error (exit code ≠ 0 means do not commit).

---

## Where it shows in the product

| Surface | Behaviour |
|---------|-----------|
| `/[locale]/news/` | Upcoming events **above** news cards; no empty-state if none |
| `/[locale]/spots/[slug]/` | Up to 3 upcoming events whose `spotIds` include this spot |
| Past events | Hidden everywhere |

---

## Validation rules (script)

- Required: `id`, `title`, `titleEn`, `summary`, `summaryEn`, `startDate`, `location`, `sport`, `kind`, `spotIds` (array)
- Unique `id`
- ISO dates; `endDate >= startDate`
- Every `spotIds[]` entry exists in `spots.ts`
- `sport` / `kind` enums
- `url` → `safeExternalUrl` (http/https only)
- `image` → `safeImageUrl` (http(s) ou caminho relativo `/images/…`; `javascript:`/`data:`/`//host` rejeitados)
- `image` path exists on disk under `public/`
