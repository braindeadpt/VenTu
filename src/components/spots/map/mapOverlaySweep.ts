// Leaflet 1.9.4's Map.remove() tears layers down by insertion id: the shared
// canvas renderer (added first, lowest id) is destroyed BEFORE the vector
// overlays that draw on it. Every Path removed afterwards calls
// _removePath -> _requestRedraw and schedules a redraw frame against the
// already-destroyed canvas (_ctx deleted but _map still set); that frame
// throws "Cannot read properties of undefined (reading 'save'/'clearRect')"
// (CI run 34075896616; leaflet#8373 class). Removing every non-renderer
// overlay FIRST — while the renderer is still alive — lets the renderer's
// own _destroyContainer (run by Map.remove) cancel any pending redraw frame.
//
// Renderers must NOT be swept here: Map.remove() destroys them itself. The
// isRenderer predicate identifies them so the sweep leaves them in place.

export interface TeardownMapLike {
  eachLayer(fn: (layer: unknown) => void): void;
  removeLayer(layer: unknown): unknown;
  remove(): unknown;
}

/**
 * Sweep every non-renderer overlay off the map before `map.remove()`, then
 * run `remove()`. The ordering is the contract: overlays must be gone while
 * the renderer is still alive, and remove() must be reached even if a single
 * overlay refuses to detach. Never throws — teardown must not take the page
 * down with the map.
 */
export function sweepOverlaysBeforeMapRemove(
  map: TeardownMapLike,
  isRenderer: (layer: unknown) => boolean,
): void {
  const overlays: unknown[] = [];
  map.eachLayer((layer) => overlays.push(layer));
  for (const layer of overlays) {
    if (isRenderer(layer)) continue;
    try {
      map.removeLayer(layer);
    } catch {
      /* one misbehaving overlay must not stop the sweep */
    }
  }
  try {
    map.remove();
  } catch {
    /* overlays are already off the map — nothing left to protect */
  }
}
