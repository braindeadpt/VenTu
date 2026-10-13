'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import WindSafetyNote from '@/components/ui/WindSafetyNote';
import SpotMiniBeach from '@/components/spots/quick/SpotMiniBeach';
import SpotVerdictCard from '@/components/spots/quick/SpotVerdictCard';
import SpotForYou from '@/components/spots/quick/SpotForYou';
import SpotPlanCard from '@/components/spots/quick/SpotPlanCard';
import SpotStudyDialog from '@/components/spots/quick/SpotStudyDialog';
import type { BeachForecastHour } from '@/components/spots/quick/SpotMiniBeach';
import { getTranslation } from '@/lib/i18n';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';

interface DeckConditions extends MarineConditionsFields {
  updatedAt?: string;
}

/**
 * Deck rápido do spot (#184) — a área que responde em ~3 s: veredicto,
 * mini-praia viva, «Para ti», instrumentos compactos e «Planear». No
 * mobile a ordem é a do contrato (veredicto → praia → para ti →
 * instrumentos → planear); a partir de lg vira duas colunas com a praia
 * e os instrumentos à esquerda e o veredicto/para-ti/planear à direita.
 *
 * O aviso de segurança do vento (side-offshore/offshore) fica por cima
 * do veredicto, em --danger, quando aplicável — contrato §critérios.
 */
export default function SpotQuickDeck({
  spot,
  locale,
  conditions,
  forecast,
  score,
  allScores,
  tabSports,
  selectedSport,
  onSelectSport,
  sportTabsAria,
  instruments,
}: {
  spot: Spot;
  locale: string;
  conditions: DeckConditions;
  forecast: readonly BeachForecastHour[];
  score: SportScore;
  allScores: Record<SportType, SportScore>;
  tabSports: SportType[];
  selectedSport: SportType;
  onSelectSport: (sport: SportType) => void;
  sportTabsAria: string;
  /** A secção de instrumentos já composta (3 cartões + acordeão). */
  instruments: ReactNode;
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const { nowResolved } = useSpotTimelineData();
  const { isNow } = useSpotTimelineIndex();
  const [studyOpen, setStudyOpen] = useState(false);
  const studyBtnRef = useRef<HTMLButtonElement>(null);

  // A nota de segurança descreve o vento de AGORA — a mesma regra do
  // hero: só aparece quando a hora escolhida é a corrente (ou ainda não
  // está resolvida — o primeiro paint é o «agora» do bake).
  const windSafety =
    isNow || !nowResolved ? (score.directionSafety ?? null) : null;

  return (
    <>
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6
          [grid-template-areas:'v'_'b'_'f'_'i'_'p']
          lg:[grid-template-areas:'b_v'_'i_f'_'i_p']"
        data-quick-deck
      >
        <div style={{ gridArea: 'v' }}>
          {windSafety && (
            <WindSafetyNote
              level={windSafety}
              locale={locale}
              className="mb-2"
            />
          )}
          <SpotVerdictCard
            spot={spot}
            locale={locale}
            conditions={conditions}
            forecast={forecast}
            score={score}
          />
        </div>

        <div style={{ gridArea: 'b' }} className="space-y-3">
          <SpotMiniBeach
            spot={spot}
            locale={locale}
            forecast={forecast}
            nowConditions={{
              windDirection: conditions.windDirection,
              windSpeed: conditions.windSpeed,
              waveDirection: conditions.waveDirection,
              waveHeight: conditions.waveHeight,
              tideHeight: conditions.tideHeight,
              tideLabel: conditions.tideLabel,
            }}
            onStudy={() => setStudyOpen(true)}
          />
          <button
            ref={studyBtnRef}
            type="button"
            onClick={() => setStudyOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-input border border-divider-strong px-4 text-sm font-medium text-fg hover:border-fg-subtle transition-colors duration-150"
          >
            {tq.beachCta}
          </button>
        </div>

        <div style={{ gridArea: 'f' }}>
          <SpotForYou
            spot={spot}
            locale={locale}
            forecast={forecast}
            conditions={conditions}
            allScores={allScores}
            tabSports={tabSports}
            selectedSport={selectedSport}
            onSelectSport={onSelectSport}
            sportTabsAria={sportTabsAria}
          />
        </div>

        <div style={{ gridArea: 'i' }}>{instruments}</div>

        <div style={{ gridArea: 'p' }}>
          <SpotPlanCard spot={spot} locale={locale} forecast={forecast} />
        </div>
      </div>

      <SpotStudyDialog
        open={studyOpen}
        onClose={() => {
          setStudyOpen(false);
          studyBtnRef.current?.focus();
        }}
        locale={locale}
      />
    </>
  );
}
