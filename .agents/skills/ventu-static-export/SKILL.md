---
name: ventu-static-export
description: VenTu is a static export on GitHub Pages — no Node runtime at request time. Use when adding routes, auth, alerts, forms, API endpoints, or anything that could depend on a server.
---

# VenTu Static Export

GitHub Pages serves only `out/` — there is no Node runtime per request.

## Hard rules
- No Route Handlers or Server Actions that the static export cannot emit.
- No per-request SSR, ISR, edge middleware, or `dynamic = 'force-dynamic'` routes.
- Auth/account logic runs client-side via Supabase (magic link, RLS) plus the
  existing `worker/` and GitHub Actions — not new server endpoints.
- All pages live under `src/app/[locale]` and must prerender for both locales.
- `npm run build` must keep producing the static export plus OG images and
  sitemap.
- Forms POST to existing external/worker endpoints only — check how alerts and
  feedback already work before adding a new one.

## When in doubt
If a feature seems to need a server, look at how alerts (docs/ALERTS.md) and
auth (docs/AUTH.md) already solved it with Supabase client + worker + Actions.
