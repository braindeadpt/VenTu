import type L from 'leaflet';

import {
  drawOceanMask,
  filesForView,
  loadOceanMaskIndex,
  loadOceanMaskSet,
  maskOpacity,
  oceanMaskIndexSync,
  preparedMaskSync,
  type OceanMaskIndex,
  type PreparedMask,
} from '@/lib/oceanMask';

/**
 * Camada Leaflet da máscara do oceano (só no basemap satélite) — um
 * L.Renderer próprio: herda o posicionamento com padding e a animação do
 * zoom (transform CSS do canvas durante o pinch/zoom), redesenha no moveend.
 * Sem interacção: o canvas tem pointer-events none e o pane também.
 *
 * Carregado em idle pelo useMapOceanMask (chunk dinâmico) — nada disto entra
 * no caminho do 1.º paint do /mapa.
 */

export const OCEAN_MASK_PANE = 'ventu-ocean-mask';
/** Entre os tiles (200) / hillshade (201) e a batimetria (210) — todas as camadas de dados ficam por cima. */
export const OCEAN_MASK_PANE_Z = '205';

export interface OceanMaskLayerOptions {
  attribution: string;
  /** Estado para o container (data-ocean-mask): e2e/capturas esperam por 'ready'. */
  onState?: (state: 'loading' | 'ready' | 'empty' | 'failed') => void;
}

type Internals = {
  _map: L.Map;
  _bounds: L.Bounds;
  _container?: HTMLCanvasElement;
  _ctx?: CanvasRenderingContext2D | null;
  _scratch?: HTMLCanvasElement;
  _scratchCtx?: CanvasRenderingContext2D | null;
  _wanted?: string;
  _lastMask?: PreparedMask | null;
  options: L.RendererOptions & OceanMaskLayerOptions;
  _redraw: () => void;
};

export function ensureOceanMaskPane(map: L.Map): HTMLElement {
  let p = map.getPane(OCEAN_MASK_PANE);
  if (!p) p = map.createPane(OCEAN_MASK_PANE);
  p.style.zIndex = OCEAN_MASK_PANE_Z;
  p.style.pointerEvents = 'none';
  return p;
}

export function createOceanMaskLayer(Leaflet: typeof L, opts: OceanMaskLayerOptions): L.Renderer {
  const Base = Leaflet.Renderer as unknown as { prototype: { _update: () => void }; extend: (p: object) => new (o: object) => L.Renderer };
  const Layer = Base.extend({
    _initContainer(this: Internals) {
      const c = document.createElement('canvas');
      c.className = 'ventu-ocean-mask';
      c.setAttribute('aria-hidden', 'true');
      c.style.pointerEvents = 'none';
      this._container = c;
      this._ctx = c.getContext('2d');
    },

    _destroyContainer(this: Internals) {
      this._container?.remove();
      this._container = undefined;
      this._ctx = null;
      this._scratch = undefined;
      this._scratchCtx = null;
    },

    getAttribution(this: Internals) {
      return this.options.attribution;
    },

    _update(this: Internals & { _zoom?: number }) {
      const map = this._map;
      if (!map || !this._ctx || !this._container) return;
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom && this._bounds) return;
      Base.prototype._update.call(this);
      const b = this._bounds;
      const size = b.getSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = this._container;
      Leaflet.DomUtil.setPosition(c, b.min!);
      const w = Math.round(size.x * dpr);
      const h = Math.round(size.y * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      c.style.width = `${size.x}px`;
      c.style.height = `${size.y}px`;
      this._redraw();
    },

    _redraw(this: Internals) {
      const map = this._map;
      const ctx = this._ctx;
      const c = this._container;
      if (!map || !ctx || !c || !this._bounds) return;
      const zoom = map.getZoom();
      const op = maskOpacity(zoom);
      c.style.opacity = String(op);
      if (op <= 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        return;
      }
      const index = oceanMaskIndexSync();
      if (!index) {
        this.options.onState?.('loading');
        void loadOceanMaskIndex().then((ix) => {
          if (!ix) this.options.onState?.('failed');
          else if (this._map) this._redraw();
        });
        return;
      }
      const b = this._bounds;
      const sw = map.layerPointToLatLng(Leaflet.point(b.min!.x, b.max!.y));
      const ne = map.layerPointToLatLng(Leaflet.point(b.max!.x, b.min!.y));
      const view = { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
      const files = filesForView(index, view, zoom);
      if (!files.length) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        this.options.onState?.('empty');
        return;
      }
      let mask = preparedMaskSync(index, files);
      const key = files.join(',');
      if (!mask) {
        this._wanted = key;
        this.options.onState?.('loading');
        void Promise.all(files.map((f) => loadOceanMaskSet(f))).then((sets) => {
          if (!this._map || this._wanted !== key) return;
          if (sets.some((s) => !s)) {
            this.options.onState?.('failed');
            return;
          }
          this._redraw();
        });
        // Enquanto as regiões chegam, o último desenho (ou o grosseiro, se já
        // estiver em cache) segura a vista — sem flash de satélite cru.
        mask = fallbackMask(index, view, zoom);
        if (!mask) return;
      }
      const pixelOrigin = map.getPixelOrigin();
      const dpr = c.width / Math.max(1, b.getSize().x);
      drawOceanMask(
        ctx,
        mask,
        {
          zoom,
          origin: { x: pixelOrigin.x + b.min!.x, y: pixelOrigin.y + b.min!.y },
          width: b.getSize().x,
          height: b.getSize().y,
          dpr,
          lat: map.getCenter().lat,
        },
        (w, h) => {
          if (!this._scratch) {
            this._scratch = document.createElement('canvas');
            this._scratchCtx = this._scratch.getContext('2d');
          }
          if (!this._scratchCtx) return null;
          if (this._scratch.width !== w || this._scratch.height !== h) {
            this._scratch.width = w;
            this._scratch.height = h;
          }
          return { canvas: this._scratch, ctx: this._scratchCtx };
        },
      );
      if (mask.key === key) this.options.onState?.('ready');
    },
  });
  return new Layer({ pane: OCEAN_MASK_PANE, padding: 0.15, ...opts });
}

function fallbackMask(index: OceanMaskIndex, view: Parameters<typeof filesForView>[1], zoom: number): PreparedMask | null {
  const coarse = filesForView(index, view, Math.min(zoom, index.regionMinZoom - 1));
  return coarse.length ? preparedMaskSync(index, coarse) : null;
}
