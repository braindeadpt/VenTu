'use client';

import { useEffect, useMemo, useRef } from 'react';
import { getScoreTokens } from '@/lib/sportScore';
import { getWindRelationToCoast } from '@/lib/wind';

interface MeteogramHour {
  time: string;
  waveHeight?: number;
  windSpeed?: number;
  windDirection?: number;
  score?: number;
}

interface ForecastMeteogramProps {
  hours: MeteogramHour[];
  coastOrientation?: number;
  isPt: boolean;
  nowMs: number;
}

const COL_W = 15;
const MAX_WAVE_M = 5;

const WIND_REL_COLOR: Record<string, string> = {
  offshore: 'rgb(var(--windDir-offshore) / 0.9)',
  onshore: 'rgb(var(--windDir-onshore) / 0.9)',
  cross: 'rgb(var(--windDir-cross) / 0.8)',
};

/**
 * Meteograma — mini-Windguru por cima da tabela: seta de vento (cor = relação
 * com a costa), barra de ondulação e célula de score por hora. Scroll
 * horizontal no mobile.
 */
export default function ForecastMeteogram({
  hours,
  coastOrientation,
  isPt,
  nowMs,
}: ForecastMeteogramProps) {
  const cols = useMemo(() => {
    const nowIdx = hours.findIndex((h) => new Date(h.time).getTime() >= nowMs);
    return hours.map((h, i) => ({
      time: h.time,
      date: new Date(h.time),
      waveHeight: h.waveHeight ?? 0,
      windKt: (h.windSpeed ?? 0) * 1.94384,
      windDir: h.windDirection ?? 0,
      relation:
        h.windDirection !== undefined && coastOrientation !== undefined
          ? getWindRelationToCoast(h.windDirection, coastOrientation)
          : 'cross',
      score: h.score ?? 0,
      isNow: i === Math.max(0, nowIdx),
      isMidnight: new Date(h.time).getHours() === 0,
    }));
  }, [hours, coastOrientation, nowMs]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nowIndex = cols.findIndex((c) => c.isNow);

  // Mesmo comportamento da tabela: abrir já centrado na hora corrente
  // (1/3 do viewport para se ver também o que vem a seguir).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nowIndex > 0) {
      el.scrollLeft = Math.max(0, nowIndex * COL_W - el.clientWidth / 3);
    }
  }, [nowIndex]);

  if (!cols.length) return null;

  const dayFmt = new Intl.DateTimeFormat(isPt ? 'pt-PT' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
  });

  // Screen readers: o role="img" precisa de dados, não só de um rótulo
  // genérico — resumimos agora + melhor hora do intervalo.
  const nowCol = cols[Math.max(0, nowIndex)];
  const bestCol = cols.reduce((a, b) => (b.score > a.score ? b : a), cols[0]);
  const ariaLabel = isPt
    ? `Meteograma das próximas ${cols.length} horas — vento, ondulação e score. ` +
      `Agora: ${nowCol.waveHeight.toFixed(1)} m, ${Math.round(nowCol.windKt)} kt, score ${nowCol.score}. ` +
      `Melhor hora: ${String(bestCol.date.getHours()).padStart(2, '0')}h com score ${bestCol.score}.`
    : `Next ${cols.length} hours meteogram — wind, swell and score. ` +
      `Now: ${nowCol.waveHeight.toFixed(1)} m, ${Math.round(nowCol.windKt)} kt, score ${nowCol.score}. ` +
      `Best hour: ${String(bestCol.date.getHours()).padStart(2, '0')}h with score ${bestCol.score}.`;

  return (
    <div className="mb-3" role="img" aria-label={ariaLabel}>
      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain no-scrollbar edge-fade-x -mx-1 px-1">
        <div
          style={{ width: cols.length * COL_W }}
          className="min-w-full relative"
          data-tl-meteogram
          data-tl-count={cols.length}
          data-tl-colw={COL_W}
        >
          {/* Linha «agora» — atravessa vento, ondas e score */}
          <div
            className="absolute top-0 bottom-7 w-px bg-fg/80 pointer-events-none z-10"
            style={{ left: cols.findIndex((c) => c.isNow) * COL_W + COL_W / 2 }}
            aria-hidden
          />
          {/* Coluna da hora escolhida no eixo partilhado — o sync da
              SpotForecastSection posiciona-a por transform (índice × COL_W)
              sem re-render do meteograma. opacity-0 até ser activada. */}
          <div
            data-tl-stripe
            className="absolute top-0 bottom-0 pointer-events-none opacity-0 z-[5] rounded-[3px]"
            style={{
              width: COL_W,
              background:
                'color-mix(in srgb, var(--verdict, rgb(var(--accent))) 14%, transparent)',
              boxShadow:
                'inset 0 0 0 1.5px color-mix(in srgb, var(--verdict, rgb(var(--accent))) 55%, transparent)',
            }}
            aria-hidden
          />
          {/* Setas de vento */}
          <div className="flex h-5 items-end" aria-hidden>
            {cols.map((c, i) => (
              <div key={i} className="relative flex items-end justify-center" style={{ width: COL_W }}>
                {c.isMidnight && <span className="absolute inset-y-[-6px] left-0 w-px bg-divider" />}
                <span
                  className="block text-[11px] leading-none"
                  style={{
                    color: WIND_REL_COLOR[c.relation],
                    transform: `rotate(${(c.windDir + 180) % 360}deg)`,
                  }}
                  title={`${Math.round(c.windKt)} kt`}
                >
                  ↑
                </span>
              </div>
            ))}
          </div>

          {/* Barras de ondulação — cols precisam de h-full para a % interna
              resolver (altura em % de pai auto → 0). */}
          <div className="flex h-12 gap-0 mt-1" aria-hidden>
            {cols.map((c, i) => {
              const hPct = Math.min(c.waveHeight / MAX_WAVE_M, 1) * 100;
              return (
                <div key={i} className="flex items-end justify-center h-full" style={{ width: COL_W }}>
                  <div
                    className="w-[9px] rounded-t-[2px]"
                    style={{
                      height: `${Math.max(hPct, 4)}%`,
                      backgroundColor: `rgb(var(--data-waves) / ${c.waveHeight > 0 ? 0.55 : 0.15})`,
                    }}
                    title={`${c.waveHeight.toFixed(1)} m`}
                  />
                </div>
              );
            })}
          </div>

          {/* Score por hora */}
          <div className="flex mt-1 rounded-[3px] overflow-hidden" aria-hidden>
            {cols.map((c, i) => (
              <div
                key={i}
                className="h-2"
                style={{
                  width: COL_W,
                  backgroundColor: `rgb(var(--score-${getScoreTokens(c.score).tier}) / ${c.score >= 60 ? 0.55 : 0.22})`,
                }}
              />
            ))}
          </div>

          {/* Eixo: dia (quando muda) em cima, hora de 6 em 6 em baixo */}
          <div className="flex mt-1" aria-hidden>
            {cols.map((c, i) => (
              <div key={i} style={{ width: COL_W }} className="relative h-7">
                {c.isMidnight && (
                  <span className="absolute left-0 top-0 text-[9px] font-mono tabular-nums text-fg-muted whitespace-nowrap capitalize">
                    {dayFmt.format(c.date)}
                  </span>
                )}
                {c.date.getHours() % 6 === 0 && (
                  <span className="absolute left-0 bottom-0 text-[9px] font-mono tabular-nums text-fg-subtle">
                    {String(c.date.getHours()).padStart(2, '0')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
