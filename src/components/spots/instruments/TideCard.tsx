'use client';

import { useMemo } from 'react';
import { getTranslation } from '@/lib/i18n';
import type { TideHourPoint } from '@/lib/tideSchedule';
import { nextTideExtremum, tideDirectionAt, tideExtrema } from '@/lib/instruments/tideExtrema';
import { svgUnit } from '@/lib/svgUnit';
import InstrumentCard, { type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import styles from './instruments.module.css';

/**
 * Cartão Maré: curva de 48 h da série horária (a mesma que alimenta o
 * eixo de tempo), marcas PM/BM interpoladas por parábola de 3 pontos
 * (tideExtrema), ponto na hora escolhida, «a encher»/«a vazar» e a
 * próxima preia-mar/baixa-mar.
 *
 * Fonte: a página não tem tábua oficial IH — `tideSchedule` e esta curva
 * vêm ambos da série `sea_level` horária da Open-Meteo (baked). Os
 * extremos são por isso calculados sobre a série horária, coerentes com
 * TideScheduleStrip (findTideExtrema, mesma série).
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
  extrema: ReturnType<typeof tideExtrema>;
  selectedIndex: number;
  locale: string;
  labels: { high: string; low: string; min: string; max: string };
}

function TideCurve({ series, extrema, selectedIndex, locale, labels }: TideCurveProps) {
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
      className={styles.fig}
      viewBox="0 0 220 220"
      aria-hidden="true"
      focusable="false"
    >
      {series.map((p, k) =>
        p.time.slice(11, 13) === '00' ? (
          <g key={p.time}>
            <line
              className={styles.gridLine}
              x1={tx(k)}
              y1={Y0 - 34}
              x2={tx(k)}
              y2={Y1}
            />
            <text className={styles.figLbl} x={tx(k) + 4} y={Y0 - 28}>
              {fmt.weekdayShort(p.time)}
            </text>
          </g>
        ) : null,
      )}
      {hmin < 0 && hmax > 0 && (
        <line className={styles.zero} x1={X0} y1={ty(0)} x2={X1} y2={ty(0)} />
      )}
      <path className={styles.curve} d={path} />
      {extrema.map((e) => {
        const x = tx(e.index);
        const y = ty(e.height);
        const up = e.type === 'high';
        return (
          <g key={`${e.type}-${e.index}`}>
            <line
              className={styles.tick}
              x1={x}
              y1={svgUnit(y + (up ? -5 : 5))}
              x2={x}
              y2={svgUnit(y + (up ? -11 : 11))}
            />
            <text
              className={styles.figLbl}
              x={x}
              y={svgUnit(y + (up ? -15 : 22))}
              textAnchor="middle"
            >
              {up ? labels.high : labels.low}
            </text>
          </g>
        );
      })}
      <text className={styles.figLbl} x={X0} y={Y1 + 20}>
        {labels.min} {fmt.fS(hmin)} m
      </text>
      <text className={styles.figLbl} x={X1} y={Y1 + 20} textAnchor="end">
        {labels.max} {fmt.fS(hmax)} m
      </text>
      {selH !== undefined && (
        <>
          <g className={styles.vline} style={{ transform: `translate(${tx(selectedIndex)}px, 0px)` }}>
            <line className={styles.selLine} x1={0} y1={Y0 - 34} x2={0} y2={Y1} />
          </g>
          <g
            className={styles.tdot}
            style={{ transform: `translate(${tx(selectedIndex)}px, ${ty(selH)}px)` }}
          >
            <circle className={styles.src} cx={0} cy={0} r={4.5} />
          </g>
        </>
      )}
    </svg>
  );
}

interface TideCardProps {
  /** Série horária completa (alinhada 1:1 com o índice do eixo de tempo). */
  tideHourly: TideHourPoint[];
  index: number;
  locale: string;
  open: boolean;
  onToggle: (id: InstrumentId) => void;
  coherence?: { text: string; linkLabel: string } | null;
}

export default function TideCard({
  tideHourly,
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
  const extrema = useMemo(() => tideExtrema(series), [series]);

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
          selectedIndex={index}
          locale={locale}
          labels={{ high: ti.markHigh, low: ti.markLow, min: ti.minLabel, max: ti.maxLabel }}
        />
      }
    >
      <span className={styles.big} data-role="big">
        {h !== undefined ? `${fmt.fS(h)} m` : '—'}
      </span>
      <span className={styles.sub}>
        {next
          ? (next.type === 'high' ? ti.tideNextHigh : ti.tideNextLow).replace('{t}', next.hhmm)
          : ti.tideNoExtremum}
      </span>
      <span className={styles.sub}>{next ? `${fmt.fS(next.height)} m` : ' '}</span>
    </InstrumentCard>
  );
}
