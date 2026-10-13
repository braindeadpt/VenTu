'use client';

import { useMemo } from 'react';
import type { Spot } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { getCardinalLabel, getWindRelationToCoast } from '@/lib/wind';
import { sunTimes } from '@/lib/verdict/sunTimes';
import {
  BEACH_VIEWBOX,
  arrowTransform,
  beachGeometry,
  dayNight,
  moonPos,
  norm360,
  sunPos,
} from '@/lib/spotMiniBeach';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/cn';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';

/** Horas do forecast na forma mínima que a mini-praia e o veredicto consomem. */
export interface BeachForecastHour {
  time: string;
  windDirection: number;
  windSpeed: number;
  windGust?: number;
  /** Pode faltar na via fallback Open-Meteo — a seta fica escondida. */
  waveDirection?: number;
  waveHeight: number;
  wavePeriod: number;
  waterTemp?: number;
  tideHeight?: number;
}

interface SpotMiniBeachProps {
  spot: Spot;
  locale: string;
  /** Forecast da página (mesma série da régua) — a hora escolhida lê daqui. */
  forecast: readonly BeachForecastHour[];
  /** Condições «agora» — fallback quando a hora escolhida é a corrente. */
  nowConditions: {
    windDirection: number;
    windSpeed: number;
    waveDirection: number;
    waveHeight: number;
    tideHeight?: number;
    tideLabel?: string;
  };
  /** Abre o placeholder «Estudar o spot». */
  onStudy: () => void;
}

const tzFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const toMin = (d: Date) => {
  const s = tzFmt.format(d);
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
};

/**
 * Mini-praia viva (#184): linha de costa estilizada por `coastOrientation`,
 * leque onshore/cross nas cores da relação vento↔costa, setas de vento e de
 * ondulação da hora escolhida, nível de maré e sol/lua — sem tiles (<15 KB).
 * Toda a geometria vem de spotMiniBeach.ts (números garantidos finitos);
 * as setas animam por rotate quando a hora muda (instantâneo em
 * reduced-motion). O cartão inteiro é um botão — abre «Estudar o spot».
 */
export default function SpotMiniBeach({
  spot,
  locale,
  forecast,
  nowConditions,
  onStudy,
}: SpotMiniBeachProps) {
  const tq = getTranslation(locale).spotPageQuick;
  const { index, isNow } = useSpotTimelineIndex();
  const { hours } = useSpotTimelineData();
  const reducedMotion = usePrefersReducedMotion();

  const geo = useMemo(
    () => beachGeometry(spot.coastOrientation),
    [spot.coastOrientation],
  );

  const sel = isNow ? nowConditions : forecast[index];
  const hourIso = isNow ? undefined : hours[index];
  const hasData = !!sel && Number.isFinite(sel.windDirection);

  // Sol/noite: nascer/pôr do dia civil da hora escolhida (mesma lógica da
  // régua — sunTimes NOAA por dia, a hora é noite antes do nascer ou a
  // partir do pôr).
  const dayKey = (hourIso ?? forecast[0]?.time)?.slice(0, 10);
  const sun = useMemo(
    () => (dayKey ? sunTimes(dayKey, spot.lat, spot.lon, 'Europe/Lisbon') : null),
    [dayKey, spot.lat, spot.lon],
  );
  const dn = useMemo(
    () =>
      dayNight({
        hourIso: hourIso ?? forecast[0]?.time,
        sunriseMin: sun ? toMin(sun.sunrise) : null,
        sunsetMin: sun ? toMin(sun.sunset) : null,
      }),
    [hourIso, forecast, sun],
  );
  const sunP = dn.dayFrac != null ? sunPos(dn.dayFrac) : null;
  const moonP = dn.isNight ? moonPos(dn.nightFrac) : null;

  const windTo = hasData ? norm360(sel.windDirection + 180) : 0;
  const hasSwellDir = hasData && Number.isFinite(sel.waveDirection);
  const swellTo = hasSwellDir ? norm360((sel.waveDirection ?? 0) + 180) : 0;
  const relation = hasData
    ? getWindRelationToCoast(sel.windDirection, spot.coastOrientation)
    : 'cross';
  const REL_COLOR: Record<string, string> = {
    onshore: 'rgb(var(--windDir-onshore))',
    offshore: 'rgb(var(--windDir-offshore))',
    cross: 'rgb(var(--windDir-cross))',
  };

  const tideText = hasData
    ? `${tq.tideWord} ${
        sel.tideHeight != null && Number.isFinite(sel.tideHeight)
          ? `${new Intl.NumberFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
              maximumFractionDigits: 1,
            }).format(sel.tideHeight)} m`
          : '—'
      }`
    : `${tq.tideWord} —`;

  const ariaDesc = hasData
    ? tq.beachAria
        .replace('{name}', spot.name)
        .replace('{facing}', getCardinalLabel(spot.coastOrientation))
        .replace(
          '{wind}',
          `${getCardinalLabel(sel.windDirection)} ${Math.round(
            sel.windSpeed * MS_TO_KNOTS,
          )} kn`,
        )
        .replace(
          '{swell}',
          `${new Intl.NumberFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
            maximumFractionDigits: 1,
          }).format(sel.waveHeight)} m ${Number.isFinite(sel.waveDirection) ? getCardinalLabel(sel.waveDirection ?? 0) : ''}`.trim(),
        )
        .replace('{tide}', tideText)
    : `${spot.name} — ${tq.beachNoData}`;

  const arrowStyle = {
    transition: reducedMotion ? 'none' : 'transform 200ms cubic-bezier(0.16,1,0.3,1)',
  } as const;

  return (
    <button
      type="button"
      onClick={onStudy}
      aria-label={`${tq.beachHint} — ${ariaDesc}`}
      data-mini-beach
      data-night={dn.isNight || undefined}
      data-hour={hourIso ?? 'now'}
      className={cn(
        'group relative block w-full overflow-hidden rounded-card border border-divider',
        'bg-surface-1/[0.04] text-left transition-colors duration-150',
        'hover:border-divider-strong focus-visible:outline-2 focus-visible:outline-accent',
      )}
    >
      <svg
        viewBox={BEACH_VIEWBOX}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={ariaDesc}
        className="block h-44 w-full lg:h-full lg:min-h-[260px]"
      >
        {/* Mar + terra + faixa de areia — a linha de costa estilizada muda
            de orientação com coastOrientation; nunca sai um NaN daqui. */}
        <polygon points={geo.seaPoints} className="fill-[#0B3350]" />
        <polygon points={geo.landPoints} className="fill-[#13241C]" />
        <path
          d={geo.coastPath}
          fill="none"
          stroke="#C9B27A"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d={geo.coastPath}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={1}
          className="text-fg-subtle"
        />

        {/* Leque do lado do mar — zona onshore ±40° e flancos cross. */}
        <path d={geo.fan.crossNear} fill="currentColor" fillOpacity={0.10} className="text-windDir-cross" />
        <path d={geo.fan.onshore} fill="currentColor" fillOpacity={0.16} className="text-windDir-onshore" />
        <path d={geo.fan.crossFar} fill="currentColor" fillOpacity={0.10} className="text-windDir-cross" />

        {hasData && (
          <>
            {/* Seta da ondulação — aponta para onde a ondulação vai (costa). */}
            {hasSwellDir && (
            <g transform={arrowTransform(geo.anchor, swellTo)} style={arrowStyle}>
              <line x1={-30} y1={0} x2={22} y2={0} stroke="rgb(var(--data-waves, 76 201 240))" strokeWidth={2.5} strokeDasharray="5 4" />
              <path d="M 22 -6 L 34 0 L 22 6 Z" fill="rgb(var(--data-waves, 76 201 240))" />
            </g>
            )}
            {/* Seta do vento — cor da relação com a costa; mais comprida. */}
            <g transform={arrowTransform(geo.anchor, windTo)} style={arrowStyle}>
              <line x1={-38} y1={0} x2={30} y2={0} stroke={REL_COLOR[relation]} strokeWidth={3} />
              <path d="M 30 -7 L 44 0 L 30 7 Z" fill={REL_COLOR[relation]} />
            </g>
          </>
        )}

        {/* Sol no arco do dia / lua no arco da noite. */}
        {sunP && (
          <g transform={`translate(${sunP.x} ${sunP.y})`} style={arrowStyle}>
            <circle r={10} fill="rgb(var(--score-fair, 242 193 78))" />
            {Array.from({ length: 8 }, (_, i) => (
              <line
                key={i}
                x1={0}
                y1={-14}
                x2={0}
                y2={-18}
                stroke="rgb(var(--score-fair, 242 193 78))"
                strokeWidth={2}
                transform={`rotate(${i * 45})`}
              />
            ))}
          </g>
        )}
        {moonP && !sunP && (
          <g transform={`translate(${moonP.x} ${moonP.y})`} style={arrowStyle}>
            <circle r={9} fill="rgb(var(--fg-subtle, 93 127 149))" />
            <circle cx={4} cy={-2} r={7.5} fill="#0B3350" />
          </g>
        )}

        {/* Véu de noite por cima de tudo (só horas fora do dia civil). */}
        {dn.isNight && (
          <rect x={0} y={0} width={320} height={200} fill="#06121F" fillOpacity={0.42} />
        )}
      </svg>

      {/* Dica + maré — HTML por cima do SVG (i18n fácil, sem texto rodado). */}
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-pill border border-divider bg-bg-elevated/90 px-2.5 py-1 text-meta-sm text-fg">
        {tq.beachHint}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
        </svg>
      </span>
      <span className="absolute left-2 bottom-2 rounded-pill border border-divider bg-bg-elevated/90 px-2 py-0.5 font-mono text-meta-sm tabular-nums text-fg-muted">
        {tideText}
      </span>
      {!hasData && (
        <span className="absolute inset-x-0 bottom-8 text-center text-meta-sm text-fg-muted">
          {tq.beachNoData}
        </span>
      )}
    </button>
  );
}
