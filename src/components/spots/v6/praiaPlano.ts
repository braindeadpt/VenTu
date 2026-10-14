/**
 * Vista plana da praia, sem WebGL (#184): fallback estático quando não há
 * WebGL2, quando o contexto se perde ou com `?webgl=0`. Norte para cima, como
 * a vista plana da maquete (`?webgl=0`), desenhada em vectorial num canvas 2D
 * com devicePixelRatio (nunca pixelizada): faixas de profundidade (a nota da
 * hora junto à praia, azuis do Atlântico ao largo), terra com as cotas do
 * relevo, areia, linha de costa e frentes de onda. A geografia vem de
 * `geoDaPraia` (a mesma do mapa 3D). Sem tiles (offline), fica o mar na cor
 * da banda, os rótulos e a grelha de setas.
 */
import { aplicarLuz, COR, corMar, frentesOnda, luz, TERRA_COTAS } from '@/lib/praiaCena';
import { frentesGeo } from '@/lib/praiaGeo';
import type { Anel, GeoPraia } from '@/lib/praiaGeo';
import { geoDaPraia } from './praiaRelevo';
import type { EstadoCena } from './praiaMapa';

const TILE = 256;

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
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  const z = desktop ? 13 : 12;
  const esc = desktop ? 1 : 1.35; // px CSS por px de tile
  const c = merc(centro[0], centro[1], z);
  const ox = c.x - W / (2 * esc);
  const oy = c.y - H / (2 * esc);
  const proj = (p: [number, number]) => {
    const m = merc(p[0], p[1], z);
    return { x: (m.x - ox) * esc, y: (m.y - oy) * esc };
  };
  const unproj = (p: [number, number]) => inv(ox + p[0] / esc, oy + p[1] / esc, z);
  let estado = estado0;
  let vivo = true;
  let geo: GeoPraia | null = null;
  let caminhos: { faixas: Path2D[]; terra: Path2D; areia: Path2D; relevo: Path2D[] } | null = null;

  const caminho = (aneis: Anel[]) => {
    const p = new Path2D();
    for (const a of aneis) {
      a.forEach((q, k) => {
        const s = proj(q);
        if (k) p.lineTo(s.x, s.y);
        else p.moveTo(s.x, s.y);
      });
      p.closePath();
    }
    return p;
  };

  function desenha() {
    if (!ctx) return;
    const e = estado;
    const L = luz(e.sunEl, e.cloud);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = corMar(e.banda, caminhos ? 7 : 2, L);
    ctx.fillRect(0, 0, W, H);
    if (caminhos) {
      // do fundo para a praia: cada conjunto {prof < d} por cima do anterior
      for (let i = caminhos.faixas.length - 1; i >= 0; i--) {
        ctx.fillStyle = corMar(e.banda, i, L);
        ctx.fill(caminhos.faixas[i], 'evenodd');
      }
    }
    // frentes de onda paradas (a vista plana é estática); a terra tapa-as
    const segs = geo ? frentesGeo(geo.ondas, e.sd, e.tp, e.hs, 3.2, desktop) : frentesOnda(ll, praiaVirada, e.sd, e.tp, e.hs, 3.2);
    ctx.strokeStyle = 'rgba(243,248,251,.7)';
    ctx.lineWidth = 1 + e.hs * 0.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const s of segs)
      s.forEach((p, k) => {
        const q = proj(p);
        if (k) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
    ctx.stroke();
    if (caminhos) {
      ctx.fillStyle = aplicarLuz(TERRA_COTAS[0], L);
      ctx.fill(caminhos.terra, 'evenodd');
      caminhos.relevo.forEach((p, k) => {
        ctx.fillStyle = aplicarLuz(TERRA_COTAS[k + 1], L);
        ctx.fill(p, 'evenodd');
      });
      ctx.fillStyle = aplicarLuz(COR.areia, L);
      ctx.fill(caminhos.areia, 'evenodd');
      ctx.strokeStyle = 'rgba(243,248,251,.7)';
      ctx.lineWidth = 1.4;
      ctx.stroke(caminhos.terra);
    }
  }

  const usar = (g: GeoPraia | null) => {
    if (!vivo || !g) return;
    geo = g;
    caminhos = {
      faixas: g.faixas.map(caminho),
      terra: caminho(g.terra),
      areia: caminho(g.areia),
      relevo: g.relevo.map(caminho),
    };
    desenha();
  };

  desenha();
  geoDaPraia(ll)
    .then(usar)
    .finally(() => vivo && onPronto());
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
