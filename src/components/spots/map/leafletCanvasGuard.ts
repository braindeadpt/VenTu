import type L from 'leaflet';

// Leaflet 1.9.4 dereferences Canvas this._ctx without checking it exists.
// During map teardown, _destroyContainer deletes _ctx, but redraw frames that
// were already scheduled (and late moveend-driven updates) can still fire
// against the destroyed renderer, throwing "Cannot read properties of
// undefined (reading 'save'/'clearRect')" (CI run 34075896616; leaflet#8373
// class). Guard both entry points at the prototype level: it covers every
// scheduling path, not just the frames our hooks cancel themselves.
let leafletCanvasGuarded = false;
export function guardLeafletCanvas(Leaflet: typeof L): void {
  if (leafletCanvasGuarded) return;
  leafletCanvasGuarded = true;
  const proto = Leaflet.Canvas.prototype as unknown as {
    _redraw: (this: { _ctx?: CanvasRenderingContext2D | null }) => void;
    _update: (this: { _ctx?: CanvasRenderingContext2D | null }) => void;
  };
  const origRedraw = proto._redraw;
  proto._redraw = function () {
    if (!this._ctx) return;
    origRedraw.call(this);
  };
  const origUpdate = proto._update;
  proto._update = function () {
    if (!this._ctx) return;
    origUpdate.call(this);
  };
}
