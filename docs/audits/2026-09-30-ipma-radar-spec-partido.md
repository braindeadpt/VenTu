# `ipma-radar-carousel.spec.ts` está partido no `main` (pré-existente)

**Descoberto em:** 30 de setembro de 2026, durante a auditoria que segue o `main` `audit/mega-2026-09-30`.
**Estado:** **por corrigir.** Não é uma regressão da auditoria — provou-se num worktree limpo de `origin/main`.

## Sintoma

13 dos 28 testes do ficheiro falham por timeout a procurar elementos que já não são renderizados:

```
Error: page.click: Test timeout of 30000ms exceeded.
  - waiting for locator('button[aria-label="Radar IPMA"]')
```

## Causa

O spec procura o par de botões avulsos do /mapa:

```ts
await page.click('button[aria-label="Radar IPMA"]');
// …
await page.click('button[aria-label="Ocultar radar"]');
```

Esse par **deixou de existir**. Quando o radar passou a ser uma camada do menu
«Camadas» (grupo «Tempo»), o /mapa deixou de ter botão próprio:

- **/mapa e embeds com menu** → linha do menu, `[data-map-radar-toggle]` com `aria-pressed`
- **hero da homepage** → botão directo, que **mantém** o nome acessível «Radar IPMA» / «Ocultar radar»
  mas **não** tem `data-map-radar-toggle`
- o `button[aria-label="Radar IPMA"]` do /mapa não existe em lado nenhum do código

## Prova

Num worktree limpo de `origin/main` (`7799d64a2`), sem qualquer alteração da auditoria:

```bash
git worktree add /tmp/verif-main origin/main --detach
grep -n 'aria-label="Radar IPMA"' tests/e2e/ipma-radar-carousel.spec.ts   # → 9 ocorrências
grep -rn 'aria-label="Radar IPMA"' src --include=*.tsx                       # → 0 ocorrências
```

O spec pede um atributo que o código já não emite.

## Como verificar o estado real do radar

Não usar `getByRole('button', { name: 'Radar IPMA' })` como proxy de estado — no /mapa
não existe, e no hero o nome muda com o estado. Usar o `aria-pressed` da linha do menu:

```ts
const menu = page.locator('[data-map-layers-menu]').first();
if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
const toggle = page.locator('[data-map-radar-toggle]').first();
if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
await expect(toggle).toHaveAttribute('aria-pressed', 'true');
```

Detalhes que custaram tempo e que o helper tem de respeitar:

1. **Idempotência** — o radar pode já vir ligado (`?radar=1`, chamada anterior): ler o
   estado antes de clicar, senão inverte-se.
2. **`aria-expanded` antes de abrir** — clicar num menu já aberto **fecha-o** e a linha
   desaparece.
3. **O menu não fecha ao alternar** — verificado no DOM, `aria-expanded` mantém-se `true`
   e o badge aparece. Reabrir depois fechava o popover.

## Nota sobre o rácio

Uma migração a meio foi tentada e revertida de propósito: levou as 13 falhas a 7, mas as
restantes envolvem três superfícies distintas (deep link do /mapa, hero e HUD mobile) e
deixaria a suíte a vermelho com o trabalho por acabar. Preferiu-se um PR limpo e este
defeito documentado.

## Testes que NÃO devem ser afectados

`data-sources.spec.ts` tem uma falha intermitente com a mesma assinatura (`networkidle`
excede 30 s sob 4 workers) mas passa isolado — é flakiness de carga, não este problema.
