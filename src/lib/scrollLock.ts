/**
 * Bloqueio de scroll do `document.body`, com CONTAGEM de referências.
 *
 * Porque existe (medido em 2026-09-27): quatro overlays escreviam
 * `document.body.style.overflow` a direito — `LoginModal`, `Drawer`, o menu
 * móvel do `Header` e o `SearchPalette`. Quem fechasse por último punha o valor
 * a `''`, desbloqueando o scroll por baixo de um overlay ainda ABERTO. No
 * `LoginModal` isso era observável: o build antigo do `Drawer` agenda um
 * `setTimeout(… 320ms)` que escreve `''` e apagava o bloqueio do diálogo que
 * tivesse aberto entretanto (a guarda `a11y-login-modal` apanhou-o de forma
 * intermitente: 2 de 3 corridas com `overflow: visible` a 390 px).
 *
 * Contrato:
 *   const release = lockBodyScroll();   // ao abrir
 *   release();                          // ao fechar/desmontar (idempotente)
 *
 * O primeiro bloqueio guarda o valor anterior; o último release devolve-o. Uso
 * só no cliente — em SSR não faz nada.
 */
let locks = 0;
let previousOverflow = '';

/**
 * Há algum overlay aberto com o scroll trancado? Usado pelas redes de
 * segurança que limpam estilos do `body` (ex. `unlockPageInteraction`) para não
 * destrancarem o scroll por baixo de um diálogo aberto.
 */
export function isBodyScrollLocked(): boolean {
  return locks > 0;
}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (locks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = previousOverflow;
  };
}
