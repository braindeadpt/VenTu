/**
 * Remove Leaflet's internal container id so a remounted div can host a new map.
 */
export function clearLeafletContainer(el: HTMLDivElement | null): void {
  if (!el) return;
  // Leaflet stores `_leaflet_id` on the container; stale ids block re-init.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (el as any)._leaflet_id;
  el.replaceChildren();
}

/**
 * Restore page scroll / pointer interaction after map fullscreen.
 * Leaflet and body overflow locks can survive a fullscreen exit without this.
 */
export function unlockPageInteraction(): void {
  if (typeof document === 'undefined') return;

  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.classList.remove(
    'ventu-map-fullscreen-open',
    'leaflet-dragging',
    'leaflet-grab',
  );
  document.documentElement.classList.remove('leaflet-dragging', 'leaflet-grab');

  const main = document.getElementById('main-content');
  if (main) {
    main.style.animation = 'none';
    main.style.opacity = '1';
    main.style.pointerEvents = '';
  }
}
