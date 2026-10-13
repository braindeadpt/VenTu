'use client';

import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getMapSpotNarrative } from '@/lib/mapSpotNarrative';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { getTranslation } from '@/lib/i18n';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import { cn } from '@/lib/cn';
import type { BeachForecastHour } from '@/components/spots/quick/SpotMiniBeach';

/**
 * «Para ti» (#184): o selector de desporto como pills e a frase humana da
 * hora escolhida — «Hoje às 17h: Bom para surf (6,6). 1,9 m a 10,3 s,
 * vento 8 kn side-onshore — algum chop». A frase vem do formatador
 * canónico do mapa (getMapSpotNarrative) alimentado com a hora escolhida:
 * mesma hora, mesma direcção, mesmo score que o resto da página.
 */
export default function SpotForYou({
  spot,
  locale,
  forecast,
  conditions,
  allScores,
  tabSports,
  selectedSport,
  onSelectSport,
  sportTabsAria,
}: {
  spot: Spot;
  locale: string;
  forecast: readonly BeachForecastHour[];
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
  tabSports: SportType[];
  selectedSport: SportType;
  onSelectSport: (sport: SportType) => void;
  sportTabsAria: string;
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const isPt = locale === 'pt';
  const { hours } = useSpotTimelineData();
  const { index, isNow, selectedHour } = useSpotTimelineIndex();

  // A hora escolhida alimenta a frase (futuro = forecast, agora = snapshot).
  const row = isNow ? null : forecast[index];
  const hourFields: MarineConditionsFields = row
    ? {
        waveHeight: row.waveHeight,
        wavePeriod: row.wavePeriod,
        waveDirection: row.waveDirection ?? conditions.waveDirection,
        windSpeed: row.windSpeed,
        windDirection: row.windDirection,
        windGust: row.windGust ?? conditions.windGust,
        waterTemp: row.waterTemp ?? conditions.waterTemp,
      }
    : conditions;

  const narrative = getMapSpotNarrative(
    spot,
    hourFields,
    allScores,
    selectedSport,
    locale,
  );

  return (
    <section aria-label={tq.forYou} className="space-y-3" data-for-you>
      <h2 className="font-display text-lg font-semibold text-fg">
        {tq.forYou}
      </h2>
      {/* radiogroup — não tablist: a página já tem UM tablist de
          modalidade na barra unificada (os specs contam exactamente 1);
          escolha exclusiva ⇔ radio/aria-checked é a semântica certa. */}
      <div
        role="radiogroup"
        aria-label={sportTabsAria}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-input border border-divider bg-surface-1/[0.04] p-1 overflow-x-auto"
      >
        {tabSports.map((s) => {
          const active = s === selectedSport;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelectSport(s)}
              className={cn(
                'min-h-[44px] whitespace-nowrap rounded-input px-3 text-sm font-medium',
                'transition-colors duration-150',
                active
                  ? 'bg-surface-3/[0.12] text-fg'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {SPORT_LABELS[s][isPt ? 'pt' : 'en']}
            </button>
          );
        })}
      </div>
      {narrative && (
        <p className="rounded-card border border-divider bg-surface-1/[0.04] p-3.5 text-sm leading-relaxed text-fg">
          {narrative}
        </p>
      )}
      {/* Âncora temporal da frase — a mesma hora que a régua marca. */}
      {selectedHour && !isNow && (
        <p className="sr-only">{hours[index]}</p>
      )}
    </section>
  );
}
