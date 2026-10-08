'use client';

import {
  HS_M_STOPS,
  WIND_KT_STOPS,
  fmt1,
  hsLegendTop,
  legendGradient,
  windLegendTop,
} from '@/lib/mapSwellField';
import type { mapUiLayersDict } from '@/lib/translations/mapUi/layers';

/**
 * Legendas das camadas de vento (escala em nós) e «Ondulação» (Hs) — mesma
 * linguagem da maquete aprovada: barra de cor com o intervalo ACTUAL da
 * grelha marcado por cima, nota curta e símbolos (isolinhas, cristas,
 * chevrons por período).
 */

type Range = { min: number; max: number } | null | undefined;

function RangeBar({ stops, top, range, ticks }: {
  stops: Parameters<typeof legendGradient>[0];
  top: number;
  range: Range;
  ticks: string[];
}) {
  const l = range ? Math.max(0, Math.min(100, (range.min / top) * 100)) : 0;
  const r = range ? Math.max(0, Math.min(100, (range.max / top) * 100)) : 0;
  return (
    <div aria-hidden>
      <div className="relative h-2 rounded mb-1" style={{ background: legendGradient(stops, top) }}>
        {range && (
          <span
            className="absolute -top-0.5 -bottom-0.5 rounded-sm border border-white/90 shadow-[0_0_0_1px_rgb(6_18_31/0.6)]"
            style={{ left: `calc(${l.toFixed(1)}% - 2px)`, width: `calc(${Math.max(0.5, r - l).toFixed(1)}% + 4px)` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
        {ticks.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </div>
  );
}

function NowRange({ template, value }: { template: string; value: string }) {
  const [pre, post = ''] = template.split('{range}');
  return (
    <>
      {pre}
      <b className="font-semibold tabular-nums text-fg">{value}</b>
      {post}.{' '}
    </>
  );
}

export function WindKtLegend({ range, copy }: { range: Range; copy: mapUiLayersDict }) {
  const top = windLegendTop(range?.max ?? 0);
  const ticks = top === 40 ? ['0', '10', '20', '30', '40'] : ['0', '10', '20', '30'];
  const now = range ? `${Math.round(range.min)}–${Math.round(range.max)} kn` : null;
  return (
    <div data-map-wind-scale>
      <RangeBar stops={WIND_KT_STOPS} top={top} range={range} ticks={ticks} />
      <p className="mt-1 text-[10px] leading-snug text-fg-muted">
        {now && <NowRange template={copy.legendNowRange} value={now} />}
        {copy.windLegendNote}
      </p>
    </div>
  );
}

function chevPath(n: number): string {
  let p = 'M1 6 H25 ';
  for (let i = 0; i < n; i++) {
    const x = 5 + i * 5;
    p += `M${x} 2 L${x + 4} 6 L${x} 10 `;
  }
  return p;
}

export function SwellLegend({ range, copy, locale }: { range: Range; copy: mapUiLayersDict; locale: string }) {
  const top = hsLegendTop(range?.max ?? 0);
  const ticks = top === 5 ? ['0', '1', '2', '3', '4', '5'] : top === 3.5 ? ['0', '1', '2', '3'] : ['0', '1', '2'];
  const now = range ? `${fmt1(range.min, locale)}–${fmt1(range.max, locale)} m` : null;
  const sym = 'flex items-center gap-2 text-[10px] text-fg-muted';
  return (
    <div data-map-swell-legend-body>
      <RangeBar stops={HS_M_STOPS} top={top} range={range} ticks={ticks} />
      <p className="mt-1 mb-1.5 text-[10px] leading-snug text-fg-muted">
        {now && <NowRange template={copy.legendNowRange} value={now} />}
        {copy.swellScaleNote}
      </p>
      <ul className="space-y-1">
        <li className={sym}>
          <svg width="26" height="12" aria-hidden className="shrink-0 text-fg">
            <path d="M1 8 C8 1 16 11 25 4" fill="none" stroke="currentColor" strokeOpacity=".7" strokeWidth="1.3" />
          </svg>
          {copy.swellIsolines}
        </li>
        <li className={sym}>
          <svg width="26" height="12" aria-hidden className="shrink-0 text-fg">
            <path d="M4 10 Q9 2 14 10 M12 10 Q17 2 22 10" fill="none" stroke="currentColor" strokeOpacity=".75" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {copy.swellCrests}
        </li>
        {[
          { n: 1, label: '< 8 s' },
          { n: 2, label: '8–11 s' },
          { n: 3, label: '11–14 s' },
          { n: 4, label: `≥ 14 s · ${copy.swellArrowNote}` },
        ].map((c) => (
          <li key={c.n} className={sym}>
            <svg width="26" height="12" aria-hidden className="shrink-0 text-data-waves">
              <path d={chevPath(c.n)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="tabular-nums">{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
