# Migração `public/data` → branch órfão `ventu-data`

Estado: **implementado** (branch `feat/data-orphan-branch`; `ventu-data`
seeded no remote — 1 commit raiz, 270 ficheiros). Notas de desvio ao plano
original (o design final é MAIS seguro):

- **Plumbing em vez de checkout**: `push-data-update.sh` e o novo
  `scripts/push-data-file.sh` NÃO fazem `checkout`/`--orphan` na worktree
  (isso destruiria `src/` numa branch só-de-dados). Usam um índice
  temporário: `read-tree origin/ventu-data` → `add -f -A` da worktree
  (captura remoções) → `write-tree` → `commit-tree` **raiz** (sem parente
  → história = 1 commit para sempre) → `push --force-with-lease` com o
  mesmo retry loop de 10 tentativas.
- **Ficheiros de outros bots** (news, dawn-patrol, community-tips,
  directory) ficam protegidos por pathspec excludes no `git add` — o
  update-data nunca os reverte; os bots secundários usam
  `push-data-file.sh` que só toca nos seus ficheiros.
- **Regen sitemap/RSS** no `push-data-file.sh` compara o blob
  `origin/ventu-data:<file>` com a worktree via `cmp` — `git diff` não
  serve porque os ficheiros são untracked na main.
- **Hydrate CI**: `git fetch origin ventu-data --depth=1 && git checkout
  FETCH_HEAD -- public/data data-state || true` após cada checkout que
  lê dados (ci.yml ×9, update-data ×2, bots, health monitors).
- **`data:bootstrap`** no package.json faz o mesmo para dev local.
- **Budget guard** (`check-data-history-budget.js`) torna-se o guard
  anti-regressão de graça: 0 ficheiros trackeados = passa; dados
  commitados de novo na main = o tecto rebenta.

## Porquê

`.git/objects/pack` = 4.7 GB, 233k objetos, 47 packs. Causa: os bots
commitam `public/data/**` na `main` a cada ~30 min (update-data) + ~3h
(news/dawn-patrol/contributions) — meses de história de dados voláteis.
O update-data comenta que o pack "tem 1,8 GiB" — duplicou desde então.

## Arquitectura alvo

- `main`: só código. `public/data/` e `data-state/` sai da árvore
  (`git rm -r --cached`) — já estão no .gitignore, os bots usam `add -f`.
- `ventu-data` (órfão): contém APENAS `public/data/` + `data-state/` +
  `public/sitemap.xml` + `public/rss*.xml` (os artefactos que os bots
  regem juntos com os dados). Cada push = amend + `--force-with-lease`
  → a branch fica com 1 commit — história nunca cresce.
- Deploy: código do último SHA verde (como hoje) + overlay de
  `public/data` **e** `public/sitemap.xml` da ponta de `ventu-data`.

## Mudanças (1 PR)

1. **`scripts/push-data-update.sh`** — `main` → `ventu-data`:
   `fetch origin ventu-data || true`; se `origin/ventu-data` existir,
   `checkout -f -B ventu-data origin/ventu-data`; senão primeira vez:
   `checkout --orphan ventu-data && git rm -rf .`.
   O bloco `owned_elsewhere` lê de `origin/ventu-data:` com fallback
   `origin/main:` (migração única). `commit` → `commit --amend` e
   `push` → `push --force-with-lease origin HEAD:ventu-data`.
   O loop de 10 tentativas já serializa races entre bots.
2. **`scripts/resolve-deploy-source.js`** — `dataSha` deixa de ser
   `mainSha`: `gitTry('rev-parse','origin/ventu-data') || mainSha`
   (fallback durante a transição). O fingerprint (`dataTree`) usa o
   mesmo SHA — nada mais muda.
3. **`deploy.yml`** — o overlay passa a
   `git checkout "$DATA_SHA" -- public/data public/sitemap.xml public/rss.xml public/rss-en.xml`
   (sitemap+RSS vivem na data-branch porque o bot de notícias os regena).
   `fetch-depth: 0` já traz todas as refs.
4. **`update-news.yml` / `dawn-patrol.yml` / `apply-contributions.yml`** —
   após gerar os ficheiros: `git fetch origin ventu-data`,
   `checkout -B ventu-data FETCH_HEAD`, `git add` dos seus ficheiros
   (news também `sitemap.xml`+`rss*.xml`), `commit --amend`,
   `push --force-with-lease` com o mesmo retry loop.
   NOTA: estas workflows geram os ficheiros sobre o checkout de main —
   precisam de hidratar `public/data` primeiro:
   `git fetch origin ventu-data && git checkout FETCH_HEAD -- public/data data-state || true`.
5. **`ci.yml`** — jobs que lêem `public/data` (`data:validate`,
   `spots:validate`, `check-sitemap-drift`, payload budgets?) ganham o
   mesmo hydrate step. `paths-ignore` de `public/data` pode sair
   (deixa de existir no repo).
6. **main**: `git rm -r --cached public/data data-state` (commit de
   limpeza único — a história antiga fica; encolher de vez = filter-repo,
   passo separado e opcional).
7. **`package.json`**: `"data:bootstrap": "git fetch origin ventu-data && git checkout FETCH_HEAD -- public/data data-state"`
   para dev local / agentes.
8. **Guard anti-regressão** (ci.yml): falhar se `public/data` voltar a
   ser trackeado na main (`git ls-files public/data | wc -l` == 0).
9. **Seeding**: primeira execução cria o órfão via o próprio script
   (ponto 1, ramo `else`). Manual: `git checkout --orphan ventu-data &&
   git rm -rf . && git checkout main -- public/data data-state &&
   commit && push -u origin ventu-data`.

## Riscos / rollout

- **Atómico**: se os bots secundários continuarem a escrever na main,
  `public/data` volta a ser trackeado (guard do ponto 8 detecta) e a
  data-branch fica sem `news.json` — deploy serviria feed stale.
- **directory.json** editado à mão: a partir daqui edita-se na branch
  `ventu-data` (documentar nos docs da pasta/AGENTS).
- Babysitting da primeira hora de runs do update-data + um deploy manual.
- `check-sitemap-drift` na CI compara o sitemap de main com dados de
  `ventu-data` — o hydrate tem de vir antes desse job.
- `data-cadence-alert`/`ih-health` lêem data — mesmo hydrate.
