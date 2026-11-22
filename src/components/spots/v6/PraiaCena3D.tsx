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
import { ArrowUpRight, Layers, RotateCcw } from 'lucide-react';
import LegendaBandas from '@/components/v6/LegendaBandas';
import { criarVento, type MotorVento } from '@/lib/ventoParticulas';
import { anguloSetaVento, camara, rotuloCurtoVizinho } from '@/lib/praiaCena';
import { rumo } from '@/lib/spotVeredicto';
import { getAssetPath } from '@/lib/paths';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import type { BandaK, Modalidade } from '@/lib/modalidades';
import type { HoraSpot } from '@/lib/horaSpot';
import type { EditorialSpot } from '@/lib/spotEditorial';
import type { EstadoCena, GrupoIsobata, HandleMapa } from './praiaMapa';
import type { HandlePlano } from './praiaPlano';

export interface Vizinho {
  nome: string;
  ll: [number, number];
}

export interface PraiaCena3DProps {
  spotId: string;
  locale: string;
  mapaSport?: string;
  nome: string;
  ll: [number, number];
  /** id do spot com geografia estática (spots curados: costa e camadas OSM) */
  idEstatico?: string;
  praiaVirada: number;
  aguaInterior?: boolean;
  aguaPlana?: boolean;
  /** true apenas quando a hora é realmente noite (distinto de semDados). */
  ehNoite?: boolean;
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
interface LblItem {
  t: string;
  x: number;
  y: number;
  grande: boolean;
  ele?: number;
  ax?: number;
  ay?: number;
}

export default function PraiaCena3D({ spotId, locale, mapaSport, nome, ll, idEstatico, praiaVirada, aguaInterior = false, aguaPlana = false, ehNoite = false, vizinhos, h, banda, d, copy: c, forcarPlano, rotulos }: PraiaCena3DProps) {
  const semOndas = aguaInterior || aguaPlana;
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
  const [vistaTopo, setVistaTopo] = useState(false);
  const [camVista, setCamVista] = useState(() => {
    const c0 = camara(ll, praiaVirada, false, rotulos?.ll, aguaInterior);
    return { bearing: c0.bearing, pitch: c0.pitch };
  });
  const [usouOSM, setUsouOSM] = useState(Boolean(idEstatico));
  const [isobDados, setIsobDados] = useState<readonly GrupoIsobata[]>([]);
  const [verIsob, setVerIsob] = useState(false);
  const [lbls, setLbls] = useState<LblItem[]>([]);
  /* rótulos da geografia estática (spots curados): o pico mais alto e as localidades do OSM */
  const extras = useRef<Array<{ t: string; ll: [number, number]; ele?: number }>>([]);
  const [pronto, setPronto] = useState(false);

  /* rótulos: o spot (grande, com pin-âncora e na cor da banda), o pico, os vizinhos e as localidades que caibam */
  const posLbls = () => {
    const p = proj.current;
    const f = fig.current;
    if (!p || !f) return;
    const W = f.clientWidth;
    const H = f.clientHeight;
    const out: LblItem[] = [];
    const caixas: Array<{ x: number; y: number; w: number; h: number }> = [];
    const ex = extras.current;
    type R = [string, [number, number], boolean, number | undefined];
    const todos: R[] = rotulos
      ? [[rotulos.praia, rotulos.ll, true, undefined], ...rotulos.lugares.map((l) => [l.n, l.ll, false, l.ele] as R)]
      : [
          [nome, ll, true, undefined],
          ...ex.filter((e) => e.ele !== undefined).map((e) => [e.t, e.ll, false, e.ele] as R),
          ...vizinhos.map((v) => [rotuloCurtoVizinho(v.nome), v.ll, false, undefined] as R),
          ...ex.filter((e) => e.ele === undefined).map((e) => [e.t, e.ll, false, undefined] as R),
        ];
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const colide = (cx: number, cy: number, cw: number, ch: number) =>
      caixas.some((q) => Math.abs(q.x - cx) < (q.w + cw) / 2 + 10 && Math.abs(q.y - cy) < (q.h + ch) / 2 + 8);
    let nPeq = 0;
    for (const [t, q, g, ele] of todos) {
      if (!g && nPeq >= 3) break;
      if (out.some((o) => o.t === t)) continue;
      const s = p.proj(q);
      if (!s) continue;
      const cw = g ? t.length * 10.5 + 28 : t.length * 7.6 + (ele !== undefined ? 48 : 16);
      const ch = g ? 34 : 20;
      if (g) {
        if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;
        const padX = Math.min(W / 2 - 8, Math.max(54, cw / 2 + 10));
        const bx = Math.round(clamp(s.x, padX, W - padX));
        const by = Math.round(clamp(s.y - 26, 62, H - 54));
        const ax = Math.round(s.x);
        const ay = Math.round(s.y);
        const pinVisivel = ax >= 12 && ax <= W - 12 && ay >= 12 && ay <= H - 12 && Math.hypot(bx - ax, by - ay) <= 120;
        out.push({ t, x: bx, y: by, grande: true, ele, ...(pinVisivel ? { ax, ay } : {}) });
        caixas.push({ x: bx, y: by, w: cw, h: ch });
        continue;
      }
      // Evita cortar picos altos (ex.: Peninha 487 m com relevo 3D) mas protege a barra de ferramentas no canto superior direito.
      const padX = rotulos ? 44 : 52;
      if (s.x < padX || s.x > W - padX || s.y < 24 || s.y > H - 40) continue;
      if (s.y < 68 && s.x + cw / 2 > W - 270) continue;
      if (colide(s.x, s.y, cw, ch)) continue;
      out.push({ t, x: Math.round(s.x), y: Math.round(s.y), grande: false, ele });
      caixas.push({ x: s.x, y: s.y, w: cw, h: ch });
      nPeq++;
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
          if (!g) {
            setUsouOSM(false);
            return;
          }
          setUsouOSM(Boolean(g.pinhal));
          extras.current = [
            ...(g.picos ?? []).slice(0, 1).map((p) => ({ t: p.n, ll: p.ll, ele: p.ele })),
            ...(g.lugares ?? []).map((l) => ({ t: l.n, ll: l.ll })),
          ];
          posLbls();
        });
    let iniciado = false;
    let visivel = false;
    let raf = 0;
    let moveRaf = 0;
    const t0 = performance.now();
    let ultimo = 0;
    const anima = (now: number) => {
      if (!document.hidden && visivel && now - ultimo > 80) {
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
      setCamVista({ bearing: 0, pitch: 0 });
      setVistaTopo(false);
      requestAnimationFrame(() => {
        if (!planoEl.current) return;
        const cam = camara(ll, praiaVirada, desk.current, rotulos?.ll, aguaInterior);
        plano.current = criarPlano(planoEl.current, ll, idEstatico, rotulos?.centroPlano ?? cam.center, praiaVirada, desk.current, estadoRef.current, () => setPronto(true), rotulos?.caixaFrentes, semOndas);
        proj.current = plano.current;
        vento.current?.tamanho();
        campoVento();
        posLbls();
      });
    };
    let criarPlano: typeof import('./praiaPlano').criarPlano;
    let ativo = true;
    const iniciar = async () => {
      iniciado = true;
      if (!semOndas) {
        void import('@/lib/isobaths')
          .then(async (m) => {
            const f = await m.loadIsobathContours();
            if (!ativo || !f) return;
            const perto = m.contoursWithinRadius(f, ll[1], ll[0], 12);
            if (perto.length) setIsobDados(perto);
          })
          .catch(() => undefined);
      }
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
        const temRato = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const hm = criarMapa({
          container: mapaEl.current,
          ll,
          idEstatico,
          praiaVirada,
          foco: rotulos?.ll,
          aguaInterior,
          semOndas,
          desktop: desk.current,
          temRato,
          reduz: reduz.current,
          estado: estadoRef.current,
          onPronto: () => {
            setCamVista({ bearing: hm.bearing(), pitch: hm.pitch() });
            posLbls();
            campoVento();
            if (!reduz.current) {
              vento.current?.iniciar();
              campoVento();
              if (!semOndas) raf = requestAnimationFrame(anima);
            }
            setTimeout(() => setPronto(true), 400);
          },
          onCamara: (b, p) => setCamVista({ bearing: b, pitch: p }),
          onMoveFrame: () => {
            if (moveRaf) return;
            moveRaf = requestAnimationFrame(() => {
              moveRaf = 0;
              posLbls();
            });
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
        setCamVista({ bearing: hm.bearing(), pitch: hm.pitch() });
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
      ativo = false;
      io.disconnect();
      window.removeEventListener('resize', rs);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(moveRaf);
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

  /* sincroniza a camada opcional de isóbatas IH (3D e vista plana) */
  useEffect(() => {
    mapa.current?.setIsob(verIsob, isobDados);
    plano.current?.setIsob(verIsob, isobDados);
  }, [verIsob, isobDados, modo]);

  const anguloChip = anguloSetaVento(h.wd, modo === '3d' ? camVista.bearing : 0, modo === '3d' ? camVista.pitch : 0);
  const sportQs = mapaSport ?? (d === 'kite' ? 'kitesurf' : 'surf');
  const mapaHref = getAssetPath(`/${locale}/mapa/?spot=${encodeURIComponent(spotId)}&sport=${encodeURIComponent(sportQs)}`);
  const sub = semOndas ? c.cenaSubInterior : d === 'kite' ? c.cenaSubKite : c.cenaSubSurf;
  const legendaTxt = semOndas ? c.legendaInterior : c.legenda;
  const relLbl = usouOSM ? c.atribuicaoRelevo : c.atribuicaoRelevo.charAt(0).toUpperCase() + c.atribuicaoRelevo.slice(1);
  const figAria = semOndas || modo === 'plano' ? `${nome} — ${sub}` : fmtCopy(c.cenaAria, { spot: nome });

  return (
    <section className="cena-sec" aria-labelledby="cena-t" data-testid="praia-3d">
      <div className="cab">
        <h2 className="sec" id="cena-t">
          {c.praia3d}
        </h2>
        <p className="sub">{sub}</p>
      </div>
      <figure
        ref={fig}
        className={`cena${modo === 'plano' ? ' sem-webgl' : ''}`}
        aria-label={figAria}
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
            <div key={l.t}>
              {l.grande && l.ax !== undefined && l.ay !== undefined ? (
                <span className="spot-pin" style={{ left: l.ax, top: l.ay }} />
              ) : null}
              <div className={`lbl-abs top-lbl${l.grande ? ' grande' : ''}`} style={{ left: l.x, top: l.y }}>
                {l.t}
                {l.ele !== undefined ? <i> {fmtCopy(c.altitude, { m: l.ele })}</i> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="cena-ferr">
          {modo === '3d' ? (
            <button
              type="button"
              className="bussola"
              data-testid="cena-bussola"
              aria-label={vistaTopo ? c.bussola3d : c.bussolaTopo}
              aria-pressed={vistaTopo}
              title={vistaTopo ? c.bussola3d : c.bussolaTopo}
              onClick={() => {
                const prox = !vistaTopo;
                setVistaTopo(prox);
                mapa.current?.topo(prox);
              }}
            >
              <span className="bussola-rosa" style={{ transform: `rotate(${-camVista.bearing}deg)` }} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3l3.2 8.2h-6.4z" fill="var(--sol)" />
                  <path d="M12 21l-3.2-8.2h6.4z" fill="rgba(243,248,251,.35)" />
                </svg>
              </span>
              <span className="bussola-n" aria-hidden="true">
                {c.norte}
              </span>
            </button>
          ) : modo === 'plano' ? (
            <span className="bussola fixa" aria-hidden="true">
              <span className="bussola-rosa">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3l3.2 8.2h-6.4z" fill="var(--sol)" />
                  <path d="M12 21l-3.2-8.2h6.4z" fill="rgba(243,248,251,.35)" />
                </svg>
              </span>
              <span className="bussola-n">{c.norte}</span>
            </span>
          ) : null}
          <span className="vento-chip" data-testid="vento-chip">
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${anguloChip}deg)` }}>
              <path d="M12 3v18M6 15l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {fmtCopy(c.chipVento, { r: rumo(h.wd), w: h.w, g: h.g })}
          </span>
          {(movido || vistaTopo) && modo === '3d' ? (
            <button
              type="button"
              className="recentrar"
              aria-label={c.recentrar}
              onClick={() => {
                mapa.current?.recentrar();
                setMovido(false);
                setVistaTopo(false);
              }}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="estatica">{c.vistaPlana}</p>
        {verIsob && isobDados.length ? (
          <div className="cena-isob-leg" data-testid="cena-isob-legenda" aria-label={c.isobatasLegenda}>
            <span className="isob-t">{c.isobatasLegenda}</span>
            {isobDados.map((g) => (
              <span key={g.depth} className="isob-item" data-prof={g.depth}>
                <i aria-hidden="true" />
                {g.depth} m
              </span>
            ))}
          </div>
        ) : null}
        <p className="credito-mapa">
          {usouOSM ? (
            <>
              © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ·{' '}
            </>
          ) : null}
          {relLbl}{' '}
          <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>
          {modo === '3d' ? ' ×1,5 · MapLibre' : null}
          {verIsob && isobDados.length ? ` · ${c.atribuicaoIsob} © IH` : null}
        </p>
        <div className="cena-rodape-dir">
          {isobDados.length ? (
            <button
              type="button"
              className="cena-isob-btn"
              data-testid="cena-isobatas"
              aria-label={c.isobatasAria}
              aria-pressed={verIsob}
              onClick={() => setVerIsob((v) => !v)}
            >
              <Layers aria-hidden="true" />
              {c.isobatas}
            </button>
          ) : null}
          <a href={mapaHref} className="cena-mapa-link" data-testid="cena-abrir-mapa">
            {c.abrirNoMapa}
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </figure>
      <LegendaBandas nomes={c.bandas} texto={legendaTxt} mostrarNoite={ehNoite} />
    </section>
  );
}
