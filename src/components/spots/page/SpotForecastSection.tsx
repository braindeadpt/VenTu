'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import ForecastMeteogram from '@/components/spots/ForecastMeteogram';
import ForecastTable, {
  type ForecastHour,
} from '@/components/weather/ForecastTable';
import Button from '@/components/ui/Button';
import type { SportType } from '@/lib/sportRatings';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
} from '@/lib/scoreConditions';

/**
 * Secção 5 do contrato (docs/design/SPOT-PAGE.md) — dona: S3.
 * Previsão hora a hora (meteograma + tabela + Windguru + expandir). A S3
 * sincroniza-a com a hora escolhida do useSpotTimeline.
 */
export interface SpotForecastSectionProps {
  locale: string;
  isPt: boolean;
  isMobile: boolean;
  /** Horas completas da previsão (com score por hora). */
  hours: ForecastHour[];
  coastOrientation?: number;
  sport: SportType;
  /** Link externo Windguru (resolvido no client). */
  windguruUrl: string;
  waveSource?: ScoreWaveSource;
  waveCorrection?: ScoreWaveCorrection | null;
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  nowMs?: number;
  copy: {
    /** «Previsão hora a hora». */
    title: string;
    windguruLink: string;
    /** Dica mobile de scroll da tabela. */
    forecastHint: string;
    expandForecast: string;
    collapseForecast: string;
    noForecast: string;
  };
}

export default function SpotForecastSection({
  locale,
  isPt,
  isMobile,
  hours,
  coastOrientation,
  sport,
  windguruUrl,
  waveSource,
  waveCorrection,
  nowMs,
  copy,
}: SpotForecastSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const forecastHours = useMemo(() => {
    if (expanded) return isMobile ? 72 : 120;
    return isMobile ? 36 : 48;
  }, [expanded, isMobile]);

  return (
    <section id="previsao" className="space-y-3 scroll-mt-32">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-h2 text-fg">{copy.title}</h2>
        <a
          href={windguruUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 min-h-[44px] -my-2 text-meta text-data-waves hover:text-data-waves/80"
        >
          {copy.windguruLink}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>
      {/* TODO: Windguru WRF 9km iframe — pending ToS review (see src/lib/windguru.ts) */}
      <p className="text-meta text-fg-muted md:hidden">{copy.forecastHint}</p>
      {hours.length > 0 ? (
        <>
          <div className="card-1 overflow-hidden p-3 md:p-4">
            <ForecastMeteogram
              hours={hours.slice(0, forecastHours)}
              coastOrientation={coastOrientation}
              isPt={isPt}
              nowMs={nowMs ?? Date.now()}
            />
            <ForecastTable
              hourly={hours}
              hours={forecastHours}
              sport={sport}
              coastOrientation={coastOrientation}
              locale={locale}
              compact={isMobile}
              waveSource={waveSource}
              waveCorrection={waveCorrection}
              nowMs={nowMs}
            />
          </div>
          {hours.length > (isMobile ? 36 : 48) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              rightIcon={
                expanded ? (
                  <ChevronUp className="w-4 h-4" aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden />
                )
              }
              locale={locale as 'pt' | 'en' | 'es' | 'de' | 'fr'}
            >
              {expanded ? copy.collapseForecast : copy.expandForecast}
            </Button>
          )}
        </>
      ) : (
        <div className="card-1 p-8 text-center text-body text-fg-subtle">
          {copy.noForecast}
        </div>
      )}
    </section>
  );
}
