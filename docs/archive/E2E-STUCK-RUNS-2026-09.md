# Runs `test:e2e:core` presos (0s CPU) — investigação e endurecimento

**Data:** 2026-09-10 | **Incidente:** 2026-09-09, 23:29 e 23:39 (locais)

## Incidente

Dois runs locais de `npm run test:e2e:core` ficaram presos durante ~45 min com
**0s de CPU** no processo npm/node, deixando para trás **4 processos órfãos**
de `npx serve out` (2 por run, portas 4177 e 4180). Um terceiro run (23:45)
continuava vivo com workers a trabalhar. Assinatura observada:

- processo pai (npm/node) vivo mas a 0s CPU — não está a correr testes;
- `serve out` órfãos — o pai foi abortado sem propagar o kill ao filho
  (comportamento conhecido do Windows: `npx` deixa filhos órfãos);
- portas 4177/4180 (não o default 4173) — agentes escolheram portas livres,
  com `reuseExistingServer: true` a reutilizar servidores órfãos de runs
  anteriores.

## Causa raiz (análise)

Os timeouts por teste (30s local / 60s CI) limitam **cada teste**, mas não a
**corrida inteira** — e o hang não estava num teste:

1. **Sem limite global**: o Playwright não tinha `globalTimeout` — um hang no
   encerramento (fecho de browsers/workers, finalização do relatório, ou o
   `npx serve` filho que não morre) deixava o processo vivo indefinidamente.
2. **Deadlock de pipe/I/O (local)**: quando o run é lançado por uma
   ferramenta que captura stdout por pipe e deixa de o drenar, o output do
   Playwright (list reporter + retries ≈ dezenas de KB) bloqueia num pipe
   cheio → processo a 0s CPU. O timer do `globalTimeout` não dispara num
   processo bloqueado em I/O — por isso o CI recebe também um backstop ao
   nível do SO (abaixo).
3. **CI sem backstop**: o job `quality` não tinha `timeout-minutes` — o
   default do GitHub Actions é **6 horas**; um step preso esgotava o runner.
4. **`reuseExistingServer: true` + portas de colisão**: servidores `serve`
   órfãos são reutilizados e acumulam-se entre runs concorrentes.

## Endurecimento aplicado (3 camadas)

| Camada | Onde | O que faz |
|--------|------|-----------|
| 1. `globalTimeout: 20 min` | `playwright.config.ts` | Aborta **qualquer** run Playwright (local ou CI) que exceda 20 min — as suites normais demoram ~1.5–10 min, margem ~2×. Cobre hangs do runner/teardown. |
| 2. `timeout-minutes: 45` no job | `.github/workflows/ci.yml` (job `quality`) | Backstop do GitHub para **todos** os steps (build, lighthouse, e2e) — falha cedo em vez dos 6h default. |
| 3. `timeout 900` no step core | `.github/workflows/ci.yml` (E2E — core) | Barreira **OS-level** (SIGTERM aos 15 min, exit 124): um processo bloqueado em I/O escapa a timers internos — este garante a morte do processo e falha o step com sinal claro. |

## Validação

- `globalTimeout` confirmado funcional: `npx playwright test --global-timeout=5000 …`
  aborta a corrida a meio ("Timed out waiting 5s for the test suite to run",
  8 did not run) em vez de ficar pendurado.
- Run normal intacto: `map-touch-targets` 8/8 com o novo config.
- YAML do workflow validado (`timeout-minutes: 45`, `timeout 900 npm run test:e2e:core`).
- `tsc --noEmit` limpo com o config alterado.

## Nota para runs LOCAIS lançados por ferramentas

O cenário 2 (deadlock de pipe) é específico de quem lança o run com stdout
canalizado e não drena o pipe — o `globalTimeout` não dispara aí. A correcção
é na ferramenta que lança (drenar/redireccionar stdout para ficheiro, ou
lançar o processo com `stdio` para ficheiro em vez de pipe).