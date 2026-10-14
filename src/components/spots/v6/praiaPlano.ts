/**
 * Vista plana da praia, sem WebGL (#184): fallback estático quando não há
 * WebGL2, quando o contexto se perde ou com `?webgl=0`. Canvas 2D, norte para
 * cima, com o mesmo relevo (AWS Terrain Tiles, terrarium) pintado com as
 * mesmas cores: o mar pela nota da hora junto à praia e azuis ao largo, a
 * terra por cima das frentes de onda. Se os tiles não chegarem (offline), fica
 * o mar na cor da banda, os rótulos e a grelha de setas.
 */
import { aplicarLuz, COR, corMar, faixaDe, frentesOnda, hexRgb, luz } from '@/lib/praiaCena';
import type { EstadoCena } from './praiaMapa';

const TILE = 256;
const URL_T = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const merc = (lon: number, lat: number, z: number) => {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const inv = (x: number, y: number, z: number): [number, number] => {
  const n = TILE * 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
};

function carregaTile(z: number, x: number, y: number): Promise<ImageData | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = TILE;
        c.height = TILE;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) return res(null);
        g.drawImage(img, 0, 0);
        res(g.getImageData(0, 0, TILE, TILE));
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = URL_T(z, x, y);
  });
}

export interface HandlePlano {
  pinta(e: EstadoCena): void;
  proj(ll: [number, number]): { x: number; y: number } | null;
  unproj(p: [number, number]): [number, number] | null;
  destruir(): void;
}

export function criarPlano(
  canvas: HTMLCanvasElement,
  ll: [number, number],
  centro: [number, number],
  praiaVirada: number,
  desktop: boolean,
  estado0: EstadoCena,
  onPronto: () => void,
): HandlePlano {
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width));
  const H = Math.max(1, Math.round(r.height));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const z = desktop ? 13 : 12;
  const esc = desktop ? 1 : 1.35; // px de ecrã por px de tile
  const c = merc(centro[0], centro[1], z);
  const ox = c.x - W / (2 * esc);
  const oy = c.y - H / (2 * esc);
  const proj = (p: [number, number]) => {
    const m = merc(p[0], p[1], z);
    return { x: (m.x - ox) * esc, y: (m.y - oy) * esc };
  };
  const unproj = (p: [number, number]) => inv(ox + p[0] / esc, oy + p[1] / esc, z);
  let elev: Float32Array | null = null;
  let estado = estado0;
  let vivo = true;

  function desenha() {
    if (!ctx) return;
    const e = estado;
    const L = luz(e.sunEl, e.cloud);
    const cores = Array.from({ length: 8 }, (_, i) => hexRgb(corMar(e.banda, i, L)));
    const fundo = cores[elev ? 6 : 2];
    ctx.fillStyle = `rgb(${fundo.join(',')})`;
    ctx.fillRect(0, 0, W, H);
    let terra: ImageData | null = null;
    if (elev) {
      const mar = ctx.createImageData(W, H);
      terra = ctx.createImageData(W, H);
      const ct = hexRgb(aplicarLuz(COR.terra, L));
      const ca = hexRgb(aplicarLuz(COR.areia, L));
      const az = ((e.sunAz || 300) * Math.PI) / 180;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k = y * W + x;
          const v = elev[k];
          const o = k * 4;
          if (v <= 0) {
            const cc = cores[faixaDe(v)];
            mar.data[o] = cc[0];
            mar.data[o + 1] = cc[1];
            mar.data[o + 2] = cc[2];
            mar.data[o + 3] = 255;
          } else {
            const dx = (elev[k + (x < W - 1 ? 1 : 0)] - elev[k - (x > 0 ? 1 : 0)]) / 2;
            const dy = (elev[k + (y < H - 1 ? W : 0)] - elev[k - (y > 0 ? W : 0)]) / 2;
            const sh = Math.max(-0.5, Math.min(0.5, (-dx * Math.sin(az) + dy * Math.cos(az)) * 0.04));
            const base = v < 3 ? ca : ct;
            const f = 1 + sh;
            terra.data[o] = base[0] * f;
            terra.data[o + 1] = base[1] * f;
            terra.data[o + 2] = base[2] * f;
            terra.data[o + 3] = 255;
          }
        }
      ctx.putImageData(mar, 0, 0);
    }
    // frentes de onda paradas (a vista plana é estática)
    const segs = frentesOnda(ll, praiaVirada, e.sd, e.tp, e.hs, 3.2);
    ctx.strokeStyle = 'rgba(243,248,251,.7)';
    ctx.lineWidth = 1 + e.hs * 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of segs)
      s.forEach((p, k) => {
        const q = proj(p);
        if (k) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
    ctx.stroke();
    if (terra) {
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      off.getContext('2d')?.putImageData(terra, 0, 0);
      ctx.drawImage(off, 0, 0);
    }
  }

  async function carrega() {
    const x0 = Math.floor(ox / TILE);
    const y0 = Math.floor(oy / TILE);
    const x1 = Math.floor((ox + W / esc) / TILE);
    const y1 = Math.floor((oy + H / esc) / TILE);
    const tiles = new Map<string, ImageData | null>();
    await Promise.all(
      Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, k) => {
        const tx = x0 + (k % (x1 - x0 + 1));
        const ty = y0 + Math.floor(k / (x1 - x0 + 1));
        return carregaTile(z, tx, ty).then((d) => tiles.set(`${tx}/${ty}`, d));
      }),
    );
    if (!vivo) return;
    if ([...tiles.values()].every((t) => !t)) return;
    const a = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gx = ox + x / esc;
        const gy = oy + y / esc;
        const tx = Math.floor(gx / TILE);
        const ty = Math.floor(gy / TILE);
        const t = tiles.get(`${tx}/${ty}`);
        if (!t) {
          a[y * W + x] = -50;
          continue;
        }
        const px = Math.floor(gx - tx * TILE);
        const py = Math.floor(gy - ty * TILE);
        const o = (py * TILE + px) * 4;
        a[y * W + x] = t.data[o] * 256 + t.data[o + 1] + t.data[o + 2] / 256 - 32768;
      }
    elev = a;
    desenha();
  }

  desenha();
  carrega().finally(() => vivo && onPronto());
  return {
    pinta(e) {
      estado = e;
      desenha();
    },
    proj,
    unproj,
    destruir() {
      vivo = false;
    },
  };
}
