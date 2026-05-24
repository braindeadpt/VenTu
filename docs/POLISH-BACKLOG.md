# Polish Backlog

> Items deferred from Lote C (Homepage Polish) for future sessions.
> Priorities are relative within each area.

---

## Status Bar

- [x] **Tooltip on status dot** — `HomepageStatusBar.tsx` (2026-05-25)

## Footer Stats

- [x] **Semantic `<dl>` refactor** — homepage stats footer (2026-05-25)

## Hero

- [ ] **`prefers-reduced-data` for radial glow** — The 600×600px radial gradient div has `opacity-[0.03]` but still loads. Consider `@media (prefers-reduced-data: reduce) { display: none }` or a data-saver variant.
  - File: `src/app/[locale]/page.tsx` ~line 194
  - Priority: Low (3G/2G users only)

## Cross-Cutting

- [ ] **Radial glow removal on low-end devices** — `(prefers-reduced-data: reduce)` media query.

---

*Generated 2026-05-18 after Lote C polish.*
