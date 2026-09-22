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

## Itens da auditoria visual fechados na revisão de 2026-09-23

- [x] **`rounded-2xl` fora do design system** — os 10 usos ad-hoc (molduras de
  mapa, skeleton, blocos da sazonalidade) passaram ao token novo
  `rounded-surface` (16px, mesma métrica → zero mudança de pixels);
  documentado em `DESIGN-SYSTEM.md`.
- [x] **Skeleton do Dawn Patrol com shift de 4px** — passa a incluir a moldura
  `border-l-4 border-l-accent` e as dimensões do banner real.
- [x] **Homepage sem grid de `SpotCard`** — verificado: é intencional desde o
  redesign. A home é *map-first* e os spots aparecem em secções ranqueadas
  (`HomepageRankedSection`) e listas (`HomepageTopNow`/`HomepageFavoritesNow`)
  que usam o `SpotListCard`, não o antigo `SpotCard` de grelha densa. Não é
  omissão.
- [x] **Botão «Voltar» do spot** — já preserva o filtro
  (`/spots/?sport=…`, com comentário no `SpotDetailHero`).
- [x] **Pesquisa duplicada (hero vs header)** — já unificada num só
  `SearchPalette` via `src/lib/searchEvents.ts`.
- [x] **Menu mobile sem animação (M1)** — já anima: `max-h` + opacidade com
  `duration-[300ms] ease-out-expo` e `motion-reduce:transition-none` na
  `#mobile-nav`; o conteúdo só existe no DOM com o menu aberto (WCAG 2.4.3).
- [~] **Largura do drawer (M-2, 420px)** — aceite como está: o painel limita a
  `maxWidth: 100vw`, pelo que não transborda em tablets estreitos.

---

*Generated 2026-05-18 after Lote C polish.*
