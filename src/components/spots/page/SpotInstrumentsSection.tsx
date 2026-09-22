'use client';

import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { TideHourPoint, TideSchedule } from '@/lib/tideSchedule';
import type { WindRelation } from '@/lib/wind';
import SpotConditionsDashboard, {
  type SpotDashboardConditions,
} from '@/components/spots/SpotConditionsDashboard';

/**
 * Secção 4 do contrato (docs/design/SPOT-PAGE.md) — dona: S2B.
 * Instrumentos Vento/Onda/Maré + painel de detalhe. Por agora renderiza o
 * SpotConditionsDashboard existente com as mesmas props.
 */
export interface SpotInstrumentsSectionProps {
  spot: Spot;
  locale: string;
  /** Copy do dashboard — o bloco `spotDetail`/`spotVerify` resolve isto hoje. */
  copy: {
    title: string;
    subtitle: string;
    gustLabel: string;
    gustHint: string;
    seaStateTitle: string;
    seaStateHint: string;
    windContextTitle: string;
    windRelationHints: Record<WindRelation, string>;
    radarFootnote: string;
    verificationTitle: string;
    scoreFeedbackHint: string;
  };
  conditions: SpotDashboardConditions;
  tideSchedule: TideSchedule | null;
  tideHourly?: TideHourPoint[];
  selectedSport: SportType;
  score: SportScore;
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  freshnessNowMs?: number;
  /** Título acessível do landmark (spotPageInstruments.sectionTitle). */
  ariaLabel: string;
}

export default function SpotInstrumentsSection({
  spot,
  locale,
  copy,
  conditions,
  tideSchedule,
  tideHourly,
  selectedSport,
  score,
  freshnessNowMs,
  ariaLabel,
}: SpotInstrumentsSectionProps) {
  return (
    <section id="instrumentos" aria-label={ariaLabel} className="scroll-mt-32">
      <SpotConditionsDashboard
        spot={spot}
        locale={locale}
        conditions={conditions}
        tideSchedule={tideSchedule}
        tideHourly={tideHourly}
        selectedSport={selectedSport}
        score={score}
        copy={copy}
        freshnessNowMs={freshnessNowMs}
      />
    </section>
  );
}
