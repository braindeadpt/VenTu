'use client';

/**
 * «A praia em 3D» (#184): cena MapLibre (lazy, WebGL2) com o mar pintado
 * pela nota da hora, frentes de onda, vento em partículas (VentoParticulas),
 * rótulos, chip do vento e botão recentrar. Antes do WebGL há um poster
 * estático (sem CLS: a figura tem altura fixa). Sem WebGL2, com o contexto
 * perdido ou `?webgl=0`: vista plana estática com a grelha de setas.
 * `prefers-reduced-motion`: setas paradas, frentes paradas, câmara sem
 * animação.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import LegendaBandas from '@/components/v6/LegendaBandas';
import { criarVento, type MotorVento } from '@/lib/ventoParticulas';
import { camara } from '@/lib/praiaCena';
import { rumo } from '@/lib/spotVeredicto';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import type { BandaK, Modalidade } from '@/lib/modalidades';
import type { HoraSpot } from '@/lib/horaSpot';
import type { EditorialSpot } from '@/lib/spotEditorial';
import type { EstadoCena, HandleMapa } from './praiaMapa';
import type { HandlePlano } from './praiaPlano';

export interface Vizinho {
  nome: string;
  ll: [number, number];
}

export interface PraiaCena3DProps {
  nome: string;
  ll: [number, number];
  /** id do spot com geografia estática (spots curados: costa e camadas OSM) */
  idEstatico?: string;
  praiaVirada: number;
  vizinhos: readonly Vizinho[];
  h: HoraSpot;
  banda: BandaK;
  d: Modalidade;
  copy: SpotPageV6Copy;
  forcarPlano: boolean;
  /** rótulos editoriais (spotEditorial.rotulos): substituem o nome, o pico, os vizinhos e as localidades */
  rotulos?: EditorialSpot['rotulos'];
}

export function temWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

type Modo = 'poster' | '3d' | 'plano';
type Proj = { proj: (ll: [number, number]) => { x: number; y: number } | null; unproj: (p: [number, number]) => [number, number] | null };

export default function PraiaCena3D({ nome, ll, idEstatico, praiaVirada, vizinhos, h, banda, d, copy: c, forcarPlano, rotulos }: PraiaCena3DProps) {
  const fig = useRef<HTMLElement>(null);
  const mapaEl = useRef<HTMLDivElement>(null);
  const planoEl = useRef<HTMLCanvasElement>(null);
  const ventoEl = useRef<HTMLCanvasElement>(null);
  const mapa = useRef<HandleMapa | null>(null);
  const plano = useRef<HandlePlano | null>(null);
  const proj = useRef<Proj | null>(null);
  const vento = useRef<MotorVento | null>(null);
  const reduz = useRef(false);
  const desk = useRef(false);
  const estadoRef = useRef<EstadoCena>({ banda, sunEl: h.sunEl, sunAz: h.sunAz, cloud: h.cloud ?? null, sd: h.sd, tp: h.tp, hs: h.hs });
  const hRef = useRef(h);
  const [modo, setModo] = useState<Modo>('poster');
  // `forcarPlano` chega depois de montar (o pai lê ?webgl=0 no seu effect, que
  // corre depois deste): lê-se por ref no arranque, e a URL também.
  const forcarRef = useRef(forcarPlano);
  useEffect(() => {
    forcarRef.current = forcarPlano;
  }, [forcarPlano]);
  const [movido, setMovido] = useState(false);
  const [lbls, setLbls] = useState<Array<{ t: string; x: number; y: number; grande: boolean; ele?: number }>>([]);
  /* rótulos da geografia estática (spots curados): o pico mais alto e as localidades do OSM */
  const extras = useRef<Array<{ t: string; ll: [number, number]; ele?: number }>>([]);
  const [pronto, setPronto] = useState(false);


  /* rótulos: o spot (grande, na cor da banda), o pico, os vizinhos e as localidades que caibam */
  const posLbls = () => {
    const p = proj.current;
    const f = fig.current;
    if (!p || !f) return;
    const W = f.clientWidth;
    const H = f.clientHeight;
    const out: Array<{ t: string; x: number; y: number; grande: boolean; ele?: number }> = [];
    const ex = extras.current;
    type R = [string, [number, number], boolean, number | undefined];
    const todos: R[] = rotulos
      ? [[rotulos.praia, rotulos.ll, true, undefined], ...rotulos.lugares.map((l) => [l.n, l.ll, false, l.ele] as R)]
      : [
      [nome, ll, true, undefined],
      ...ex.filter((e) => e.ele !== undefined).map((e) => [e.t, e.ll, false, e.ele] as [string, [number, number], boolean, number | undefined]),
      ...vizinhos.map((v) => [v.nome, v.ll, false, undefined] as [string, [number, number], boolean, number | undefined]),
      ...ex.filter((e) => e.ele === undefined).map((e) => [e.t, e.ll, false, undefined] as [string, [number, number], boolean, number | undefined]),
      ];
    let nPeq = 0;
    for (const [t, q, g, ele] of todos) {
      if (!g && nPeq >= 3) break;
      if (out.some((o) => o.t === t)) continue;
      const s = p.proj(q);
      // rótulos editoriais: posições escolhidas à mão (as da maquete), só se cortam os que saem do ecrã;
      // os automáticos (nome, picos, vizinhos, localidades) não se podem sobrepor.
      if (rotulos) {
        if (!s || s.x < 50 || s.x > W - 50 || s.y < 60 || s.y > H - 30) continue;
      } else {
        if (!s || s.x < 60 || s.x > W - 60 || s.y < 70 || s.y > H - 40) continue;
        if (!g && out.some((o) => Math.abs(o.x - s.x) < 130 && Math.abs(o.y - s.y) < 34)) continue;
      }
      out.push({ t, x: Math.round(s.x), y: Math.round(s.y - (g ? 22 : 0)), grande: g, ele });
      if (!g) nPeq++;
    }
    setLbls(out);
  };

  /* vento: uniforme na área (a previsão é de um ponto), projectado no ecrã com a perspectiva */
  const campoVento = () => {
    const p = proj.current;
    const cv = ventoEl.current;
    const v = vento.current;
    if (!p || !cv || !v) return;
    const hh = hRef.current;
    const to = ((hh.wd + 180) * Math.PI) / 180;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    const S = 30;
    const nx = Math.ceil(W / S) + 1;
    const ny = Math.ceil(H / S) + 1;
    const g: Array<[number, number] | null> = new Array(nx * ny);
    const kpx = desk.current ? 3.4 : 2.8;
    const dd = 0.004;
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const q = p.unproj([x * S, y * S]);
        if (!q) {
          g[y * nx + x] = null;
          continue;
        }
        const p0 = p.proj(q);
        const p1 = p.proj([q[0] + (Math.sin(to) * dd) / Math.cos((q[1] * Math.PI) / 180), q[1] + Math.cos(to) * dd]);
        if (!p0 || !p1) {
          g[y * nx + x] = null;
          continue;
        }
        const vx = p1.x - p0.x;
        const vy = p1.y - p0.y;
        const m = Math.hypot(vx, vy) || 1;
        const sp = hh.w * kpx * Math.max(0.45, Math.min(1.3, m / 18));
        g[y * nx + x] = [(vx / m) * sp, (vy / m) * sp];
      }
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    v.campo((x, y) => {
      const gx = x / S;
      const gy = y / S;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      if (x0 < 0 || y0 < 0 || x0 >= nx - 1 || y0 >= ny - 1) return null;
      const a = g[y0 * nx + x0];
      const b = g[y0 * nx + x0 + 1];
      const cc = g[(y0 + 1) * nx + x0];
      const e = g[(y0 + 1) * nx + x0 + 1];
      if (!a || !b || !cc || !e) return null;
      const fx = gx - x0;
      const fy = gy - y0;
      return [lerp(lerp(a[0], b[0], fx), lerp(cc[0], e[0], fx), fy), lerp(lerp(a[1], b[1], fx), lerp(cc[1], e[1], fx), fy)];
    });
    if (reduz.current || modoRef.current === 'plano') v.estatico();
  };
  const modoRef = useRef<Modo>('poster');
  useEffect(() => {
    modoRef.current = modo;
  }, [modo]);

  /* arranque: decide 3D ou plano quando a cena se aproxima do viewport */
  useEffect(() => {
    const f = fig.current;
    if (!f) return;
    reduz.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    desk.current = window.matchMedia('(min-width: 1024px)').matches;
    if (ventoEl.current)
      vento.current = criarVento(ventoEl.current, {
        n: desk.current ? 190 : 95,
        vida: [3, 6],
        cauda: 1.4,
        vref: 62,
        meandro: 0.2,
        largura: desk.current ? 1.8 : 1.6,
        alfa: 0.9,
      });
    if (idEstatico)
      void import('./praiaRelevo')
        .then((m) => m.geoDaPraia(ll, idEstatico))
        .then((g) => {
          if (!g) return;
          extras.current = [
            ...(g.picos ?? []).slice(0, 1).map((p) => ({ t: p.n, ll: p.ll, ele: p.ele })),
            ...(g.lugares ?? []).map((l) => ({ t: l.n, ll: l.ll })),
          ];
          posLbls();
        });
    let iniciado = false;
    let visivel = false;
    let raf = 0;
    const t0 = performance.now();
    let ultimo = 0;
    const anima = (now: number) => {
      if (!document.hidden && visivel && now - ultimo > 50) {
        ultimo = now;
        mapa.current?.frentes((now - t0) / 1000);
      }
      raf = requestAnimationFrame(anima);
    };
    const usarPlano = () => {
      mapa.current?.destruir();
      mapa.current = null;
      modoRef.current = 'plano';
      setModo('plano');
      requestAnimationFrame(() => {
        if (!planoEl.current) return;
        const cam = camara(ll, praiaVirada, desk.current);
        plano.current = criarPlano(planoEl.current, ll, idEstatico, rotulos?.centroPlano ?? cam.center, praiaVirada, desk.current, estadoRef.current, () => setPronto(true), rotulos?.caixaFrentes);
        proj.current = plano.current;
        vento.current?.tamanho();
        campoVento();
        posLbls();
      });
    };
    let criarPlano: typeof import('./praiaPlano').criarPlano;
    const iniciar = async () => {
      iniciado = true;
      const forcar = forcarRef.current || new URLSearchParams(window.location.search).get('webgl') === '0';
      if (forcar || !temWebGL2()) {
        criarPlano = (await import('./praiaPlano')).criarPlano;
        usarPlano();
        return;
      }
      try {
        const [{ criarMapa }, pl] = await Promise.all([import('./praiaMapa'), import('./praiaPlano')]);
        criarPlano = pl.criarPlano;
        if (!mapaEl.current) return;
        setModo('3d');
        const hm = criarMapa({
          container: mapaEl.current,
          ll,
          idEstatico,
          praiaVirada,
          desktop: desk.current,
          reduz: reduz.current,
          estado: estadoRef.current,
          onPronto: () => {
            posLbls();
            campoVento();
            if (!reduz.current) {
              vento.current?.iniciar();
              campoVento();
              raf = requestAnimationFrame(anima);
            }
            setTimeout(() => setPronto(true), 400);
          },
          onMexe: (inicio, user) => {
            if (inicio) vento.current?.limpar();
            else {
              campoVento();
              posLbls();
              if (user) setMovido(true);
            }
          },
          onPerdido: () => usarPlano(),
        });
        mapa.current = hm;
        proj.current = hm;
      } catch {
        if (!criarPlano) criarPlano = (await import('./praiaPlano')).criarPlano;
        usarPlano();
      }
    };
    const io = new IntersectionObserver(
      (es) => {
        visivel = es.some((e) => e.isIntersecting);
        vento.current?.pausar(!visivel);
        if (visivel && !iniciado) void iniciar();
      },
      { threshold: 0.15 },
    );
    io.observe(f);
    const rs = () => {
      vento.current?.tamanho();
      vento.current?.limpar();
      campoVento();
      posLbls();
    };
    window.addEventListener('resize', rs);
    return () => {
      io.disconnect();
      window.removeEventListener('resize', rs);
      cancelAnimationFrame(raf);
      vento.current?.parar();
      mapa.current?.destruir();
      plano.current?.destruir();
      mapa.current = null;
      plano.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* mudar de hora / modalidade: o mesmo objecto da hora pinta o mar, o vento e as frentes */
  useEffect(() => {
    estadoRef.current = { banda, sunEl: h.sunEl, sunAz: h.sunAz, cloud: h.cloud ?? null, sd: h.sd, tp: h.tp, hs: h.hs };
    hRef.current = h;
    mapa.current?.pinta(estadoRef.current);
    plano.current?.pinta(estadoRef.current);
    campoVento();
    posLbls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, banda, d]);

  return (
    <section className="cena-sec" aria-labelledby="cena-t" data-testid="praia-3d">
      <div className="cab">
        <h2 className="sec" id="cena-t">
          {c.praia3d}
        </h2>
        <p className="sub">{d === 'kite' ? c.cenaSubKite : c.cenaSubSurf}</p>
      </div>
      <figure
        ref={fig}
        className={`cena${modo === 'plano' ? ' sem-webgl' : ''}`}
        aria-label={fmtCopy(c.cenaAria, { spot: nome })}
        data-modo={modo}
        data-pronto={pronto ? '1' : '0'}
        data-banda={banda}
        style={{ '--band': `var(--b-${banda})`, '--band-t': `var(--b-${banda}-t)` } as CSSProperties}
      >
        <div className="poster" aria-hidden="true" />
        <canvas ref={planoEl} className="plano" aria-hidden="true" />
        <div ref={mapaEl} className="mapa" aria-hidden="true" />
        <canvas ref={ventoEl} className="vento" aria-hidden="true" />
        <div aria-hidden="true">
          {lbls.map((l) => (
            <div key={l.t} className={`lbl-abs top-lbl${l.grande ? ' grande' : ''}`} style={{ left: l.x, top: l.y }}>
              {l.t}
              {l.ele !== undefined ? <i> {fmtCopy(c.altitude, { m: l.ele })}</i> : null}
            </div>
          ))}
        </div>
        <div className="cena-ferr">
          <span className="vento-chip" data-testid="vento-chip">
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${h.wd}deg)` }}>
              <path d="M12 3v18M6 15l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {fmtCopy(c.chipVento, { r: rumo(h.wd), w: h.w, g: h.g })}
          </span>
          {movido && modo === '3d' ? (
            <button
              type="button"
              className="recentrar"
              aria-label={c.recentrar}
              onClick={() => {
                mapa.current?.recentrar();
                setMovido(false);
              }}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="estatica">{c.vistaPlana}</p>
        <p className="credito-mapa">
          © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · {c.atribuicaoRelevo}{' '}
          <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> ×1,5 · MapLibre
        </p>
      </figure>
      <LegendaBandas nomes={c.bandas} texto={c.legenda} />
    </section>
  );
}
