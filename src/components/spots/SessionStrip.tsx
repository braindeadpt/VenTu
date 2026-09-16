'use client';

import { useMemo } from 'react';
import { getScoreTokens } from '@/lib/sportScore';
import type { MagicWindow } from '@/lib/magicWindows';

interface StripHour {
  time: string;
  score: number;
  tideHeight?: number;
}

interface SessionStripProps {
  hours: StripHour[];
  windows: MagicWindow[];
  isPt: boolean;
  nowMs: number;
}

const HOUR_MS = 3_600_000;
const AXIS_TICKS = [0, 6, 12, 18, 24];

/**
 * Faixa de sessão — 24h num só olhar: score por hora (cor), janelas boas
 * (segmentos), curva de maré (linha) e marcador «agora». Responde a
 * «quando é que vale a pena?» sem ler tabelas.
 */
export default function SessionStrip({ hours, windows, isPt, nowMs }: SessionStripProps) {
  const axisStart = useMemo(() => {
    const d = new Date(hours[0]?.time ?? nowMs);
    d.setMinutes(0, 0, 0);
    return d.getTime();
  }, [hours, nowMs]);

  const tickLabels = useMemo(
    () =>
      AXIS_TICKS.map((offset) => {
        const h = new Date(axisStart + offset * HOUR_MS).getHours();
        return `${String(h).padStart(2, '0')}h`;
      }),
    [axisStart],
  );

  const tidePath = useMemo(() => {
    const pts = hours
      .map((h, i) => {
        if (typeof h.tideHeight !== 'number') return null;
        const x = (new Date(h.time).getTime() - axisStart) / (24 * HOUR_MS);
        return { x, h: h.tideHeight };
      })
      .filter(Boolean) as { x: number; h: number }[];
    if (pts.length < 2) return null;
    const min = Math.min(...pts.map((p) => p.h));
    const max = Math.max(...pts.map((p) => p.h));
    const range = Math.max(max - min, 0.01);
    return pts
      .map((p, i) => {
        const x = Math.min(Math.max(p.x, 0), 1) * 100;
        const y = 85 - ((p.h - min) / range) * 70; // 15–85% do alto da faixa
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [hours, axisStart]);

  const nowPct = Math.min(Math.max((nowMs - axisStart) / (24 * HOUR_MS), 0), 1) * 100;
  const axisHours = hours.map((h) => (new Date(h.time).getTime() - axisStart) / HOUR_MS);

  return (
    <div
      role="img"
      aria-label={
        isPt
          ? 'Faixa das próximas 24 horas com score por hora, janelas boas e maré'
          : 'Next 24 hours strip with hourly score, good windows and tide'
      }
    >
      <div className="relative h-10 rounded-pill border border-divider bg-surface-1/[0.05] overflow-visible">
        {/* Score por hora */}
        <div className="absolute inset-0 flex overflow-hidden rounded-pill" aria-hidden>
          {hours.map((h, i) => {
            const tier = getScoreTokens(h.score).tier;
            const strong = h.score >= 60;
            return (
              <div
                key={i}
                className="flex-1"
                style={{
                  backgroundColor: `rgb(var(--score-${tier}) / ${strong ? 0.4 : 0.14})`,
                }}
                title={`${new Date(h.time).getHours()}h — ${h.score}`}
              />
            );
          })}
        </div>

        {/* Maré */}
        {tidePath && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={tidePath}
              fill="none"
              stroke="rgb(var(--data-waves) / 0.8)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        )}

        {/* Janelas boas */}
        {windows.map((w, i) => {
          const start = axisHours[w.start] ?? 0;
          const end = (axisHours[w.end] ?? 0) + 1;
          const left = Math.max(0, (start / 24) * 100);
          const width = Math.min(100 - left, ((end - start) / 24) * 100);
          const tier = getScoreTokens(w.score).tier;
          return (
            <div
              key={i}
              className="absolute inset-y-1 rounded-pill border-2 pointer-events-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                borderColor: `rgb(var(--score-${tier}) / 0.8)`,
                backgroundColor: `rgb(var(--score-${tier}) / 0.12)`,
              }}
              aria-hidden
            />
          );
        })}

        {/* Agora */}
        <div
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-fg rounded-pill pointer-events-none"
          style={{ left: `${nowPct}%` }}
          aria-hidden
        />
      </div>

      <div
        className="flex justify-between px-0.5 mt-1 text-[10px] font-mono tabular-nums text-fg-subtle"
        aria-hidden
      >
        {tickLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
