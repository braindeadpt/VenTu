/**
 * Partículas de vento em canvas 2D (#184; partilhado com a home #183).
 * Porta de `docs/design/maquetes/v6-atlantico` (`_build/vento.js`), mesmo
 * comportamento:
 * - `campo(x, y) → [vx, vy]` em px/s de ecrã, ou `null` (a partícula renasce);
 * - cada partícula é um traço com cauda de duração fixa (comprimento ∝
 *   velocidade), desenhado como UM caminho contínuo com UM stroke e degradê de
 *   alfa da cauda (0) para a cabeça, `lineCap/lineJoin: round`; alfa e
 *   espessura sobem com a velocidade;
 * - meandro lento e rajadas ±14 %; ±4,6° por partícula;
 * - mudar de hora: as partículas viram e aceleram para o novo campo em 0,9 s
 *   (sem limpar nem recomeçar);
 * - `estatico()`: grelha de setas (prefers-reduced-motion e sem WebGL);
 * - pausa com `document.hidden` e fora do viewport (`pausar`, ligado a um
 *   IntersectionObserver no componente); `devicePixelRatio` limitado a 2.
 */
export type CampoVento = (x: number, y: number) => [number, number] | null;

export interface OpcoesVento {
  n?: number;
  vida?: [number, number];
  cor?: string;
  alfa?: number;
  largura?: number;
  cauda?: number;
  vref?: number;
  meandro?: number;
  transicao?: number;
}

export interface MotorVento {
  campo(f: CampoVento): MotorVento;
  tamanho(): MotorVento;
  iniciar(): MotorVento;
  parar(): MotorVento;
  pausar(p: boolean): MotorVento;
  estatico(): MotorVento;
  limpar(): MotorVento;
  avanca(n?: number): MotorVento;
}

interface Particula {
  x: number;
  y: number;
  vida: number;
  idade: number;
  h: Array<[number, number]>;
  sp: number;
  ph: number;
}

export function criarVento(canvas: HTMLCanvasElement, opcoes?: OpcoesVento): MotorVento {
  const op = {
    n: 300,
    vida: [3, 6] as [number, number],
    cor: '243,248,251',
    alfa: 0.9,
    largura: 1.4,
    cauda: 0.9,
    vref: 40,
    meandro: 0.16,
    transicao: 900,
    ...opcoes,
  };
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let P: Particula[] = [];
  let campo: CampoVento = () => null;
  let antigo: CampoVento | null = null;
  let t0Trans = 0;
  let raf = 0;
  let ultimo = 0;
  let vivo = false;
  let pausado = false;
  let relogio = 0;
  let instantaneo = true;
  const MAXH = 72;

  function tamanho() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ease = (s: number) => (s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2);
  function vel(x: number, y: number, ph: number): [number, number] | null {
    let v = campo(x, y);
    if (antigo) {
      const s = Math.min(1, (performance.now() - t0Trans) / op.transicao);
      if (s >= 1) antigo = null;
      else {
        const a = antigo(x, y);
        const k = ease(s);
        if (a && v) v = [a[0] + (v[0] - a[0]) * k, a[1] + (v[1] - a[1]) * k];
        else if (a && !v) v = s < 0.5 ? a : null;
      }
    }
    if (!v) return null;
    const th =
      op.meandro *
        (0.65 * Math.sin(x * 0.013 + y * 0.004 + relogio * 0.5) +
          0.35 * Math.cos(y * 0.017 - x * 0.006 - relogio * 0.4)) +
      (ph || 0);
    const g = 1 + 0.14 * Math.sin(x * 0.011 - y * 0.007 + relogio * 0.6);
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [(v[0] * c - v[1] * s) * g, (v[0] * s + v[1] * c) * g];
  }
  function nova(p: Particula | null, rand?: boolean): Particula {
    const q = (p ?? {}) as Particula;
    let k = 0;
    do {
      q.x = Math.random() * W;
      q.y = Math.random() * H;
      k++;
    } while (k < 8 && !campo(q.x, q.y));
    q.vida = op.vida[0] + Math.random() * (op.vida[1] - op.vida[0]);
    q.idade = rand ? Math.random() * q.vida : 0;
    q.h = [[q.x, q.y]];
    q.sp = 0;
    q.ph = (Math.random() - 0.5) * 0.16;
    return q;
  }
  function semear() {
    P = Array.from({ length: op.n }, () => nova(null, true));
  }
  function mover(dt: number) {
    relogio += dt;
    const nh = Math.max(4, Math.min(MAXH, Math.round(op.cauda / dt)));
    for (const p of P) {
      p.idade += dt;
      const v = vel(p.x, p.y, p.ph);
      if (!v || p.idade > p.vida || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
        nova(p);
        continue;
      }
      p.x += v[0] * dt;
      p.y += v[1] * dt;
      p.sp = Math.hypot(v[0], v[1]);
      p.h.push([p.x, p.y]);
      if (p.h.length > nh) p.h.splice(0, p.h.length - nh);
    }
  }
  function desenhar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of P) {
      const h = p.h;
      const n = h.length;
      if (n < 3) continue;
      const fade = Math.min(1, p.idade / 0.6, (p.vida - p.idade) / 0.8);
      const a0 = op.alfa * fade * Math.min(1, 0.28 + (0.72 * p.sp) / op.vref);
      if (a0 < 0.02) continue;
      const t0 = h[0];
      const t1 = h[n - 1];
      if (Math.abs(t1[0] - t0[0]) + Math.abs(t1[1] - t0[1]) < 0.5) continue;
      const g = ctx.createLinearGradient(t0[0], t0[1], t1[0], t1[1]);
      g.addColorStop(0, `rgba(${op.cor},0)`);
      g.addColorStop(0.45, `rgba(${op.cor},${(a0 * 0.38).toFixed(3)})`);
      g.addColorStop(1, `rgba(${op.cor},${a0.toFixed(3)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = op.largura * (0.8 + 0.5 * Math.min(1, p.sp / op.vref));
      ctx.beginPath();
      ctx.moveTo(t0[0], t0[1]);
      for (let i = 1; i < n - 1; i++) {
        const mx = (h[i][0] + h[i + 1][0]) / 2;
        const my = (h[i][1] + h[i + 1][1]) / 2;
        ctx.quadraticCurveTo(h[i][0], h[i][1], mx, my);
      }
      ctx.lineTo(t1[0], t1[1]);
      ctx.stroke();
    }
  }
  function loop(t: number) {
    if (!vivo) return;
    if (!document.hidden && !pausado && t - ultimo > 30) {
      const dt = Math.min(0.05, (t - (ultimo || t)) / 1000) || 0.033;
      ultimo = t;
      mover(dt);
      desenhar();
    } else if (document.hidden || pausado) {
      ultimo = 0;
    }
    raf = requestAnimationFrame(loop);
  }
  function setas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const s = W < 600 ? 38 : 48;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let y = s / 2; y < H; y += s)
      for (let x = s / 2 + ((y / s) % 2) * (s / 2); x < W; x += s) {
        const v = campo(x, y);
        if (!v) continue;
        const sp = Math.hypot(v[0], v[1]);
        if (sp < 0.1) continue;
        const L = Math.min(s * 0.85, 8 + sp * 0.45);
        const ux = v[0] / sp;
        const uy = v[1] / sp;
        const x1 = x - (ux * L) / 2;
        const y1 = y - (uy * L) / 2;
        const x2 = x + (ux * L) / 2;
        const y2 = y + (uy * L) / 2;
        ctx.strokeStyle = `rgba(${op.cor},${(op.alfa * Math.min(0.85, 0.35 + (0.5 * sp) / op.vref)).toFixed(2)})`;
        ctx.lineWidth = op.largura * 1.1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const a = Math.atan2(uy, ux);
        const k = 4.5;
        ctx.moveTo(x2 - k * Math.cos(a - 0.55), y2 - k * Math.sin(a - 0.55));
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - k * Math.cos(a + 0.55), y2 - k * Math.sin(a + 0.55));
        ctx.stroke();
      }
  }
  const api: MotorVento = {
    campo(f) {
      if (vivo && !instantaneo && P.length) {
        antigo = campo;
        t0Trans = performance.now();
      } else antigo = null;
      campo = f;
      instantaneo = false;
      if (!P.length) semear();
      return api;
    },
    tamanho() {
      tamanho();
      return api;
    },
    iniciar() {
      tamanho();
      semear();
      vivo = true;
      ultimo = 0;
      instantaneo = false;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      return api;
    },
    parar() {
      vivo = false;
      cancelAnimationFrame(raf);
      return api;
    },
    pausar(p) {
      pausado = p;
      return api;
    },
    estatico() {
      vivo = false;
      cancelAnimationFrame(raf);
      tamanho();
      setas();
      return api;
    },
    limpar() {
      ctx?.clearRect(0, 0, W, H);
      antigo = null;
      instantaneo = true;
      P.forEach((p) => nova(p, true));
      return api;
    },
    avanca(n = 120) {
      antigo = null;
      for (let k = 0; k < n; k++) mover(0.033);
      desenhar();
      return api;
    },
  };
  return api;
}

/** Campo por interpolação (IDW) de vectores [lon, lat, nós, de-onde-sopra°]. */
export function idwVento(pts: ReadonlyArray<readonly [number, number, number, number]>, lon: number, lat: number, pot = 2) {
  let su = 0;
  let sv = 0;
  let sw = 0;
  let sk = 0;
  const kx = Math.cos((lat * Math.PI) / 180);
  for (const [x, y, w, wd] of pts) {
    const d2 = ((x - lon) * kx) ** 2 + (y - lat) ** 2 + 1e-4;
    const p = 1 / Math.pow(d2, pot / 2);
    const to = ((wd + 180) * Math.PI) / 180;
    su += Math.sin(to) * w * p;
    sv += Math.cos(to) * w * p;
    sk += w * p;
    sw += p;
  }
  return { u: su / sw, v: sv / sw, w: sk / sw };
}
