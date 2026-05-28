/** Dispatched from hero search; Header opens SearchPalette. */
export const OPEN_SEARCH_EVENT = 'ventu:open-search';

export function dispatchOpenSearch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}
