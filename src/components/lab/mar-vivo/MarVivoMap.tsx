'use client';

/**
 * «Mar vivo» — protótipo do hero da homepage (lab, noindex).
 *
 * MapLibre GL + duas camadas WebGL2 custom (partículas de vento, cristas de
 * ondulação) + pontos de score por spot, tudo guiado por uma linha temporal
 * única de 48 h com interpolação linear entre os passos de 3 h de
 * `map-hours.json`. Este ficheiro só é carregado por import dinâmico
 * (MarVivoLoader), por isso o maplibre-gl não entra no bundle de outras páginas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Pause, Play, Waves, Wind } from 'lucide-react';
import type { MapHoursFile } from '@/lib/mapHours';
import { getAssetPath } from '@/lib/paths';
import { buildSeaField, GRID, sampleSeaField, windAtCell, type SeaField, type SpotSeries } from './field';
import { LAND_MASK } from './landMask';
import { COAST, LABELS_BEFORE, LAND, loadBaseStyle } from './mapStyle';
import { marVivoStrings } from './strings';
import { SwellCrestLayer } from './swellLayer';
import { formatLisbonLabel, lisbonLocalToUtcMs, nightVeilOpacity, sunAltitudeDeg } from './time';
import type { MarVivoMode, ScoreThresholds, SeedSpot, SwellSnapshot } from './types';
import { WindParticleLayer } from './windLayer';

export interface MarVivoMapProps {
  locale: string;
  seeds: SeedSpot[];
  swell: SwellSnapshot | null;
  thresholds: ScoreThresholds;
}

/** Segundos de reprodução por passo de 3 h (48 h ≈ 32 s). */
const SECONDS_PER_STEP = 2;

/** Tokens do tema escuro (globals.css) — o mapa é sempre escuro. */
const TIER_RGB = {
  epic: 'rgb(14,165,233)',
  good: 'rgb(16,185,129)',
  fair: 'rgb(245,158,11)',
  poor: 'rgb(248,113,113)',
  closed: 'rgb(107,114,128)',
};

type Phase = 'loading' | 'ready' | 'error' | 'nowebgl';

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function isSmallDevice(): boolean {
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  return narrow || (coarse && cores <= 4);
}

function tierOf(score: number, t: ScoreThresholds): keyof typeof TIER_RGB {
  if (score >= t.epic) return 'epic';
  if (score >= t.good) return 'good';
  if (score >= t.fair) return 'fair';
  if (score >= t.poor) return 'poor';
  return 'closed';
}

/** Cor do ponto: degraus do score, com uma rampa curta (±1.5) em cada limiar para transitar no sítio. */
function scoreColorExpression(t: ScoreThresholds): maplibregl.ExpressionSpecification {
  const s = ['coalesce', ['feature-state', 'score'], 0] as maplibregl.ExpressionSpecification;
  return [
    'interpolate',
    ['linear'],
    s,
    t.poor - 1.5, TIER_RGB.closed,
    t.poor + 1.5, TIER_RGB.poor,
    t.fair - 1.5, TIER_RGB.poor,
    t.fair + 1.5, TIER_RGB.fair,
    t.good - 1.5, TIER_RGB.fair,
    t.good + 1.5, TIER_RGB.good,
    t.epic - 1.5, TIER_RGB.good,
    t.epic + 1.5, TIER_RGB.epic,
  ];
}

/** Setas estáticas (movimento reduzido): uma a cada 3 células com confiança. */
function buildArrows(f: SeaField): Float32Array {
  const out: number[] = [];
  const [x0, y0, x1, y1] = f.bounds;
  for (let j = 1; j < f.ny; j += 3) {
    for (let i = 1; i < f.nx; i += 3) {
      const c = j * f.nx + i;
      const w = windAtCell(f, c);
      if (w.mask < 0.2) continue;
      const mx = x0 + ((i + 0.5) / f.nx) * (x1 - x0);
      const my = y0 + ((j + 0.5) / f.ny) * (y1 - y0);
      out.push(mx, my, w.u, w.v, w.mask);
    }
  }
  return new Float32Array(out);
}

export default function MarVivoMap({ locale, seeds, swell, thresholds }: MarVivoMapProps) {
  const s = useMemo(() => marVivoStrings(locale), [locale]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fieldRef = useRef<SeaField | null>(null);
  const hoursRef = useRef<MapHoursFile | null>(null);
  const windRef = useRef<WindParticleLayer | null>(null);
  const swellRef = useRef<SwellCrestLayer | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(true);
  const reducedRef = useRef(false);
  const lastSampledRef = useRef(-1);

  const [phase, setPhase] = useState<Phase>('loading');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<MarVivoMode>('both');
  const [reduced, setReduced] = useState(false);
  const [meta, setMeta] = useState<{ times: string[]; generatedAt: string; seeds: number; hasSwell: boolean }>(
    { times: [], generatedAt: '', seeds: 0, hasSwell: false },
  );

  // prefers-reduced-motion: setas estáticas, sem autoplay.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
      if (mq.matches) {
        playingRef.current = false;
        setPlaying(false);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /** Aplica o instante `tt` a tudo: campo, pontos de score, véu nocturno. */
  const applyTime = useCallback(
    (tt: number) => {
      const map = mapRef.current;
      const field = fieldRef.current;
      const hours = hoursRef.current;
      if (!map || !field || !hours) return;
      if (Math.abs(tt - lastSampledRef.current) < 1e-3) return;
      lastSampledRef.current = tt;

      sampleSeaField(field, tt);
      windRef.current?.setField(field.texWind);
      swellRef.current?.setField(field.texWind, field.texSwell);
      if (reducedRef.current) windRef.current?.setArrows(buildArrows(field));

      const i0 = Math.floor(tt);
      const i1 = Math.min(i0 + 1, hours.times.length - 1);
      const a = tt - i0;
      for (const seed of seeds) {
        const best = hours.spots[seed.id]?.best;
        if (!best) continue;
        const score = (best[i0] ?? 0) * (1 - a) + (best[i1] ?? 0) * a;
        map.setFeatureState({ source: 'mv-spots', id: seed.id }, { score });
      }

      const ms =
        lisbonLocalToUtcMs(hours.times[i0]) * (1 - a) + lisbonLocalToUtcMs(hours.times[i1]) * a;
      const alt = sunAltitudeDeg(ms, 39.6, -8.4);
      if (map.getLayer('mv-night')) map.setPaintProperty('mv-night', 'fill-opacity', nightVeilOpacity(alt));
      map.triggerRepaint();
    },
    [seeds],
  );

  // Arranque: dados + estilo → campo → mapa.
  useEffect(() => {
    if (!hasWebGL2()) {
      setPhase('nowebgl');
      return;
    }
    const ac = new AbortController();
    let disposed = false;
    let raf = 0;

    (async () => {
      try {
        const [hoursRes, style] = await Promise.all([
          fetch(getAssetPath('/data/map-hours.json'), { signal: ac.signal }),
          loadBaseStyle(ac.signal),
        ]);
        if (!hoursRes.ok) throw new Error(`map-hours ${hoursRes.status}`);
        const hours = (await hoursRes.json()) as MapHoursFile;
        if (disposed) return;
        if (!Array.isArray(hours.times) || hours.times.length < 2 || !hours.wind) {
          throw new Error('map-hours sem vento');
        }
        hoursRef.current = hours;

        const series: Record<string, SpotSeries> = {};
        for (const seed of seeds) {
          const w = hours.wind[seed.id];
          if (!w) continue;
          series[seed.id] = { windSpd: w.spd, windDir: w.dir, hs: hours.hs?.[seed.id] ?? w.spd.map(() => 0) };
        }
        const field = buildSeaField({ times: hours.times, seeds, series, swell });
        fieldRef.current = field;
        setMeta({
          times: hours.times,
          generatedAt: hours.generatedAt,
          seeds: field.windSeedCount,
          hasSwell: field.hasSwell,
        });

        const small = isSmallDevice();
        const container = containerRef.current;
        if (!container || disposed) return;
        const map = new maplibregl.Map({
          container,
          style,
          center: [-8.6, 39.55],
          zoom: small ? 5.55 : 6.35,
          pitch: 28,
          maxPitch: 50,
          minZoom: 4.5,
          maxZoom: 12,
          maxBounds: [
            [-17, 33],
            [0, 46],
          ],
          dragRotate: false,
          // Tecto de DPR: 1.5 em telemóvel, 2 no resto.
          pixelRatio: Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2),
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: false, powerPreference: 'high-performance' },
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;

        map.on('load', () => {
          if (disposed) return;
          const wind = new WindParticleLayer({
            // Orçamento de partículas: telemóvel ~1/3 do desktop.
            count: small ? 3200 : 9000,
            trail: small ? 5 : 7,
            bounds: field.bounds,
            gridW: GRID.nx,
            gridH: GRID.ny,
          });
          const swellLayer = new SwellCrestLayer({ bounds: field.bounds, gridW: GRID.nx, gridH: GRID.ny });
          wind.animate = !reducedRef.current;
          swellLayer.animate = !reducedRef.current;
          swellLayer.lines = field.hasSwell ? 1 : 0;
          windRef.current = wind;
          swellRef.current = swellLayer;

          map.addSource('mv-land', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: LAND_MASK },
            attribution: 'Natural Earth',
          });
          map.addSource('mv-night', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [[[-30, 25], [15, 25], [15, 55], [-30, 55], [-30, 25]]],
              },
            },
          });
          map.addSource('mv-spots', {
            type: 'geojson',
            promoteId: 'id',
            data: {
              type: 'FeatureCollection',
              features: seeds
                .filter((sd) => hours.spots[sd.id])
                .map((sd) => ({
                  type: 'Feature' as const,
                  properties: { id: sd.id, name: sd.name },
                  geometry: { type: 'Point' as const, coordinates: [sd.lon, sd.lat] },
                })),
            },
          });

          // Ordem: fundo(mar) → cristas → terra → água interior (do estilo) → … → véu nocturno → vento → etiquetas → pontos.
          map.addLayer(swellLayer, 'water');
          map.addLayer({ id: 'mv-land', type: 'fill', source: 'mv-land', paint: { 'fill-color': LAND } }, 'water');
          map.addLayer(
            {
              id: 'mv-coast',
              type: 'line',
              source: 'mv-land',
              paint: {
                'line-color': COAST,
                'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.2],
              },
            },
            'water',
          );
          const before = map.getLayer(LABELS_BEFORE) ? LABELS_BEFORE : undefined;
          map.addLayer(
            { id: 'mv-night', type: 'fill', source: 'mv-night', paint: { 'fill-color': '#020617', 'fill-opacity': 0 } },
            before,
          );
          map.addLayer(wind, before);
          map.addLayer({
            id: 'mv-spots',
            type: 'circle',
            source: 'mv-spots',
            paint: {
              'circle-color': scoreColorExpression(thresholds),
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 5, 11, 7],
              'circle-stroke-color': '#020617',
              'circle-stroke-width': 1,
              'circle-opacity': 0.95,
            },
          });

          map.on('click', 'mv-spots', (e) => {
            const feat = e.features?.[0];
            if (!feat) return;
            const id = String(feat.properties?.id ?? '');
            const name = String(feat.properties?.name ?? id);
            const score = Math.round(Number(map.getFeatureState({ source: 'mv-spots', id }).score ?? 0));
            const tier = tierOf(score, thresholds);
            const tierLabel = {
              epic: s.tierEpic,
              good: s.tierGood,
              fair: s.tierFair,
              poor: s.tierPoor,
              closed: s.tierClosed,
            }[tier];
            const el = document.createElement('div');
            el.className = 'text-sm';
            const title = document.createElement('div');
            title.className = 'font-medium';
            title.textContent = name;
            const line = document.createElement('div');
            line.className = 'font-mono tabular-nums';
            line.textContent = `${s.score} ${score} · ${tierLabel}`;
            el.append(title, line);
            new maplibregl.Popup({ closeButton: false, offset: 8 })
              .setLngLat(e.lngLat)
              .setDOMContent(el)
              .addTo(map);
          });
          map.on('mouseenter', 'mv-spots', () => (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', 'mv-spots', () => (map.getCanvas().style.cursor = ''));

          lastSampledRef.current = -1;
          applyTime(tRef.current);
          setPhase('ready');
          startLoop();
        });
        map.on('error', (ev) => {
          // Falhas de tile isoladas não matam o protótipo; só registamos.
          console.warn('[mar-vivo]', ev.error?.message ?? ev);
        });
      } catch (err) {
        if (disposed || (err as Error).name === 'AbortError') return;
        console.error('[mar-vivo]', err);
        setPhase('error');
      }
    })();

    let lastFrame = 0;
    let lastUiPush = 0;
    const frame = (now: number) => {
      raf = 0;
      if (disposed || document.hidden) return; // pausa total com o separador escondido
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      const field = fieldRef.current;
      if (playingRef.current && field) {
        let nt = tRef.current + dt / SECONDS_PER_STEP;
        if (nt > field.steps - 1) nt = 0;
        tRef.current = nt;
        applyTime(nt);
        // Estado React (rótulo + slider) a ~15 Hz chega.
        if (now - lastUiPush > 66) {
          lastUiPush = now;
          setT(nt);
        }
      }
      if (!reducedRef.current) mapRef.current?.triggerRepaint();
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => {
      if (!raf && !disposed && !document.hidden) {
        lastFrame = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (mapRef.current) {
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      ac.abort();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      mapRef.current?.remove();
      mapRef.current = null;
      windRef.current = null;
      swellRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Movimento reduzido ligado/desligado depois do arranque.
  useEffect(() => {
    if (windRef.current) windRef.current.animate = !reduced;
    if (swellRef.current) swellRef.current.animate = !reduced;
    lastSampledRef.current = -1;
    applyTime(tRef.current);
  }, [reduced, applyTime]);

  // Camadas visíveis por modo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || phase !== 'ready') return;
    const vis = (on: boolean) => (on ? 'visible' : 'none');
    map.setLayoutProperty('mar-vivo-wind', 'visibility', vis(mode !== 'swell'));
    map.setLayoutProperty('mar-vivo-swell', 'visibility', vis(mode !== 'wind'));
    map.triggerRepaint();
  }, [mode, phase]);

  const onScrub = (v: number) => {
    tRef.current = v;
    setT(v);
    applyTime(v);
  };

  const togglePlay = () => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
  };

  const times = meta.times;
  // Hora interpolada à hora certa (passos de 3 h) para o rótulo.
  let li = Math.floor(t);
  let off = Math.round((t - li) * 3);
  if (off >= 3) {
    li += 1;
    off = 0;
  }
  li = Math.min(li, Math.max(0, times.length - 1));
  const label = times.length ? formatLisbonLabel(times[li], s.weekdays) : null;
  const hourNow = times.length ? (Number(times[li].slice(11, 13)) + off) % 24 : 0;
  const generated = meta.generatedAt;

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-[#0a1828]"
      style={{ height: 'calc(100svh - 4rem)', minHeight: 520 }}
      aria-label={s.mapLabel}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Cabeçalho editorial */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[22rem] sm:left-6 sm:top-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">{s.eyebrow}</p>
        <h1 className="mt-1 font-display text-4xl font-semibold leading-none text-slate-50 sm:text-5xl">{s.title}</h1>
        <p className="mt-2 text-sm text-slate-300">{s.lede}</p>
      </div>

      {/* Modo */}
      <div
        role="group"
        aria-label={s.modeLabel}
        className="absolute right-4 top-4 z-10 flex gap-1 rounded-full border border-white/10 bg-slate-950/75 p-1 backdrop-blur sm:right-6 sm:top-6"
      >
        {(
          [
            ['both', s.modeBoth, null],
            ['wind', s.modeWind, <Wind key="w" className="h-4 w-4" aria-hidden />],
            ['swell', s.modeSwell, <Waves key="s" className="h-4 w-4" aria-hidden />],
          ] as const
        ).map(([key, text, icon]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
              mode === key ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            {icon}
            <span className={key === 'both' ? '' : 'hidden sm:inline'}>{text}</span>
            {key !== 'both' && <span className="sr-only sm:hidden">{text}</span>}
          </button>
        ))}
      </div>

      {/* Estados */}
      {phase !== 'ready' && (
        <div className="absolute inset-0 z-20 grid place-items-center">
          <p
            role={phase === 'loading' ? 'status' : 'alert'}
            className="rounded-lg border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-200"
          >
            {phase === 'loading' ? s.loading : phase === 'nowebgl' ? s.noWebgl : s.error}
          </p>
        </div>
      )}

      {/* Legenda */}
      <div className="pointer-events-none absolute bottom-[8.5rem] left-4 z-10 hidden w-56 space-y-2 rounded-lg border border-white/10 bg-slate-950/75 p-3 text-[11px] text-slate-300 backdrop-blur sm:left-6 md:block">
        {mode !== 'swell' && (
          <div>
            <p className="mb-1 text-slate-400">{s.legendWind}</p>
            <div
              className="h-1.5 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, rgb(148,163,184) 0%, rgb(34,211,238) 25%, rgb(167,139,250) 47%, rgb(251,191,36) 68%, rgb(248,113,113) 100%)',
              }}
            />
            <div className="mt-0.5 flex justify-between font-mono tabular-nums text-slate-400">
              <span>0</span><span>10</span><span>18</span><span>25</span><span>32+</span>
            </div>
          </div>
        )}
        {mode !== 'wind' && (
          <div>
            <p className="mb-1 text-slate-400">{s.legendHs}</p>
            <div
              className="h-1.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, rgb(3,105,161), rgb(14,165,233) 45%, rgb(241,245,249))' }}
            />
            <div className="mt-0.5 flex justify-between font-mono tabular-nums text-slate-400">
              <span>0.3</span><span>1.4</span><span>3+</span>
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-slate-400">{s.legendScore}</p>
          <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {(
              [
                ['epic', s.tierEpic],
                ['good', s.tierGood],
                ['fair', s.tierFair],
                ['poor', s.tierPoor],
                ['closed', s.tierClosed],
              ] as const
            ).map(([k, txt]) => (
              <li key={k} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: TIER_RGB[k] }} />
                {txt}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Linha temporal única */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-slate-950/80 p-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={phase !== 'ready'}
              aria-label={playing ? s.pause : s.play}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-900 transition-transform duration-150 active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
            </button>
            <div className="min-w-[6.5rem] font-mono tabular-nums text-slate-100">
              <div className="text-xs uppercase tracking-wider text-slate-400">{label?.day ?? '—'}</div>
              <div className="text-xl leading-tight">{`${String(hourNow).padStart(2, '0')}h`}</div>
            </div>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, times.length - 1)}
                step={0.01}
                value={t}
                disabled={phase !== 'ready'}
                onChange={(e) => onScrub(Number(e.target.value))}
                onPointerDown={() => {
                  if (playingRef.current) togglePlay();
                }}
                aria-label={s.timeline}
                aria-valuetext={label ? `${label.day}, ${String(hourNow).padStart(2, '0')}h` : undefined}
                className="h-11 w-full cursor-pointer accent-sky-400"
              />
              <div className="pointer-events-none mt-[-6px] flex justify-between px-[2px] font-mono text-[10px] uppercase tabular-nums text-slate-500">
                {times.map((tm, k) => {
                  const h = tm.slice(11, 13);
                  const isDay = h === '00';
                  return (
                    <span key={tm} className={isDay ? 'text-slate-300' : k % 2 ? 'opacity-0 sm:opacity-100' : ''}>
                      {isDay ? formatLisbonLabel(tm, s.weekdays).day : h}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            {generated ? `${s.generated}: ${generated}. ` : ''}
            {s.idwNote.replace('{n}', String(meta.seeds || '—'))}
            {phase === 'ready' && !meta.hasSwell ? ` ${s.noSwell}` : ''}
            {reduced ? ` ${s.reducedMotion}` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}

