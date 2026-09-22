# Polish Backlog

> Items deferred from Lote C (Homepage Polish) for future sessions.
> Priorities are relative within each area.

---

## Status Bar

- [x] **Tooltip on status dot** — `HomepageStatusBar.tsx` (2026-05-25)

## Footer Stats

- [x] **Semantic `<dl>` refactor** — homepage stats footer (2026-05-25)

## Hero

- [x] **`prefers-reduced-data` for radial glow** — resolvido: a regra
  `@media (prefers-reduced-data: reduce) { .hero-radial-glow-disc { display: none } }`
  vive em `globals.css:550-555` e o `docs/ROADMAP.md:93` marca-a como feita.
  O elemento de glow 600×600 (`opacity-[0.03]`) foi removido do hero no
  redesign da homepage — não há hoje nenhum nó com a classe, pelo que a regra
  fica como rede de segurança para o caso de o glow voltar.
  - Prioridade: n/a (obsoleto)

## Cross-Cutting

- [x] **Radial glow removal on low-end devices** — mesma regra
  `prefers-reduced-data` acima; nada a fazer enquanto o glow não existir.

---

*Generated 2026-05-18 after Lote C polish.*
