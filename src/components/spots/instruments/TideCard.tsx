'use client';

import { useMemo } from 'react';
import { getTranslation } from '@/lib/i18n';
import type { TideHourPoint, TideSchedule } from '@/lib/tideSchedule';
import { nextTideExtremum, tideDirectionAt } from '@/lib/instruments/tideExtrema';
import { resolveTideExtrema } from '@/lib/instruments/tideExtremaSource';
import { svgUnit } from '@/lib/svgUnit';
import InstrumentCard, { type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import { INST_BIG, INST_SUB } from './classes';

/**
 * Cartão Maré: curva de 48 h da série horária (a mesma que alimenta o
 * eixo de tempo), marcas PM/BM, ponto na hora escolhida, «a encher»/
 * «a vazar» e a próxima preia-mar/baixa-mar.
 *
 * Fonte dos extremos (resolveTideExtrema): quando `tideSchedule` existe e
 * a tábua cobre a janela, as marcas e a «próxima PM/BM» vêm da tábua
 * canónica (findTideExtrema — a mesma do TideScheduleStrip, por isso o
 * cartão e a tábua dizem a mesma hora); a parábola tideExtrema fica como
 * fallback. A fonte fica exposta em data-tide-extrema-source.
 */

const X0 = 16;
const X1 = 204;
const Y0 = 62;
const Y1 = 180;
/** Janela da curva — as 48 h da régua (docs/design/SPOT-PAGE.md §3). */
const CURVE_HOURS = 48;

interface TideCurveProps {
  /** Série já filtrada e cortada às 48 h. */
  series: TideHourPoint[];
  extrema: ReturnType<typeof resolveTideExtrema>['extrema'];
  source: ReturnType<typeof resolveTideExtrema>['source'];
  selectedIndex: number;
  locale: string;
  labels: { high: string; low: string; min: string; max: string };
}

function TideCurve({ series, extrema, source, selectedIndex, locale, labels }: TideCurveProps) {
  const fmt = getInstrumentFmt(locale);

  const hs = series.map((p) => p.tideHeight as number);
  const hmin = Math.min(...hs);
  const hmax = Math.max(...hs);
  const pad = (hmax - hmin) * 0.14 || 0.2;
  const n = Math.max(1, series.length - 1);
  const tx = (k: number) => svgUnit(X0 + ((X1 - X0) * k) / n);
  const ty = (h: number) =>
    svgUnit(Y1 - ((Y1 - Y0) * (h - (hmin - pad))) / (hmax + pad - (hmin - pad)));

  const path = series
    .map((p, k) => `${k ? 'L' : 'M'}${tx(k)} ${ty(p.tideHeight as number)}`)
    .join('');

  const selH =
    selectedIndex >= 0 && selectedIndex < series.length
      ? series[selectedIndex].tideHeight
      : undefined;

  return (
    <svg
      className="ventu-inst-fig block aspect-square w-full max-w-[128px] min-[760px]:max-w-[250px] justify-self-center overflow-visible"
      viewBox="0 0 220 220"
      aria-hidden="true"
      focusable="false"
      data-tide-extrema-source={source}
    >
      {series.map((p, k) =>
        p.time.slice(11, 13) === '00' ? (
          <g key={p.time}>
            <line
              className="ventu-inst-grid-line"
              x1={tx(k)}
              y1={Y0 - 34}
              x2={tx(k)}
              y2={Y1}
            />
            <text className="ventu-inst-fig-text ventu-inst-fig-label" x={tx(k) + 4} y={Y0 - 28}>
              {fmt.weekdayShort(p.time)}
            </text>
          </g>
        ) : null,
      )}
      {hmin < 0 && hmax > 0 && (
        <line className="ventu-inst-zero" x1={X0} y1={ty(0)} x2={X1} y2={ty(0)} />
      )}
      <path className="ventu-inst-curve" d={path} />
      {extrema.map((e) => {
        const x = tx(e.index);
        const y = ty(e.height);
        const up = e.type === 'high';
        return (
          <g key={`${e.type}-${e.index}`}>
            <line
              className="ventu-inst-tick"
              x1={x}
              y1={svgUnit(y + (up ? -5 : 5))}
              x2={x}
              y2={svgUnit(y + (up ? -11 : 11))}
            />
            <text
              className="ventu-inst-fig-text ventu-inst-fig-label"
              x={x}
              y={svgUnit(y + (up ? -15 : 22))}
              textAnchor="middle"
            >
              {up ? labels.high : labels.low}
            </text>
          </g>
        );
      })}
      <text className="ventu-inst-fig-text ventu-inst-fig-label" x={X0} y={Y1 + 20}>
        {labels.min} {fmt.fS(hmin)} m
      </text>
      <text className="ventu-inst-fig-text ventu-inst-fig-label" x={X1} y={Y1 + 20} textAnchor="end">
        {labels.max} {fmt.fS(hmax)} m
      </text>
      {selH !== undefined && (
        <>
          <g className="ventu-inst-vline" style={{ transform: `translate(${tx(selectedIndex)}px, 0px)` }}>
            <line className="ventu-inst-sel-line" x1={0} y1={Y0 - 34} x2={0} y2={Y1} />
          </g>
          <g
            className="ventu-inst-tdot"
            style={{ transform: `translate(${tx(selectedIndex)}px, ${ty(selH)}px)` }}
          >
            <circle className="ventu-inst-src" cx={0} cy={0} r={4.5} />
          </g>
        </>
      )}
    </svg>
  );
}

interface TideCardProps {
  /** Série horária completa (alinhada 1:1 com o índice do eixo de tempo). */
  tideHourly: TideHourPoint[];
  /** Tábua canónica — quando existe, PM/BM vêm dela (resolveTideExtrema). */
  tideSchedule: TideSchedule | null;
  index: number;
  locale: string;
  open: boolean;
  onToggle: (id: InstrumentId) => void;
  coherence?: { text: string; linkLabel: string } | null;
}

export default function TideCard({
  tideHourly,
  tideSchedule,
  index,
  locale,
  open,
  onToggle,
  coherence,
}: TideCardProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const fmt = getInstrumentFmt(locale);

  const series = useMemo(
    () =>
      tideHourly
        .filter((p) => typeof p.tideHeight === 'number')
        .slice(0, CURVE_HOURS),
    [tideHourly],
  );
  const { extrema, source } = useMemo(
    () =>
      resolveTideExtrema({
        schedule: tideSchedule,
        series,
        tableSeries: tideHourly,
      }),
    [tideSchedule, series, tideHourly],
  );

  const h = index >= 0 && index < series.length ? series[index].tideHeight : undefined;
  const direction = tideDirectionAt(series, index);
  const next = nextTideExtremum(extrema, index);

  return (
    <InstrumentCard
      instrument="tide"
      label={ti.tide}
      chip={
        direction === 'rising'
          ? ti.tideRising
          : direction === 'falling'
            ? ti.tideFalling
            : undefined
      }
      open={open}
      onToggle={onToggle}
      coherence={coherence}
      fig={
        <TideCurve
          series={series}
          extrema={extrema}
          source={source}
          selectedIndex={index}
          locale={locale}
          labels={{ high: ti.markHigh, low: ti.markLow, min: ti.minLabel, max: ti.maxLabel }}
        />
      }
    >
      <span className={INST_BIG} data-role="big">
        {h !== undefined ? `${fmt.fS(h)} m` : '—'}
      </span>
      <span className={INST_SUB}>
        {next
          ? (next.type === 'high' ? ti.tideNextHigh : ti.tideNextLow).replace('{t}', next.hhmm)
          : ti.tideNoExtremum}
      </span>
      <span className={INST_SUB}>{next ? `${fmt.fS(next.height)} m` : ' '}</span>
    </InstrumentCard>
  );
}
