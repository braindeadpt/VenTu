'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getScoreTokens, type SportScore } from '@/lib/sportScore';
import type { TideHourPoint, TideSchedule } from '@/lib/tideSchedule';
import type { WindRelation } from '@/lib/wind';
import { resolveScoreWindCorrection, resolveScoreWindSource } from '@/lib/scoreConditions';
import type { SpotDashboardConditions } from '@/components/spots/SpotConditionsDashboard';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import InstrumentCard, { type InstrumentId } from '@/components/spots/instruments/InstrumentCard';
import WindCard from '@/components/spots/instruments/WindCard';
import SwellCard from '@/components/spots/instruments/SwellCard';
import TideCard from '@/components/spots/instruments/TideCard';
import InstrumentDetail from '@/components/spots/instruments/InstrumentDetail';
import { useInstrumentRows } from '@/components/spots/instruments/useInstrumentRows';
import { useInstrumentPaused } from '@/components/spots/instruments/useInstrumentPaused';
import {
  conditionsToInstrumentHour,
  rowToInstrumentHour,
  tidePointsFromRows,
} from '@/components/spots/instruments/types';
import { getTranslation } from '@/lib/i18n';
import styles from '@/components/spots/instruments/instruments.module.css';

/**
 * Secção 4 do contrato (docs/design/SPOT-PAGE.md) — dona: S2B.
 * Três cartões iguais (Vento · Onda · Maré) com marcas de corte, a ler a
 * hora escolhida do eixo de tempo partilhado, mais um painel de detalhe
 * único que reutiliza os componentes de verificação existentes.
 *
 * Acento único: `--vi-verdict` = token --score-* do tier da hora
 * escolhida (a S2A aplica --verdict no contentor da página; aqui o
 * atributo data-tier produz o mesmo valor dentro da secção).
 *
 * Gancho E2E (spec passo 9 — nesta worktree ainda não existe o slider da
 * régua, que é S2A): o índice expõe-se pelo CustomEvent
 * «ventu:spot-timeline-set» (detail = índice) e reflecte-se em
 * data-spot-timeline-index no contentor. A S3 pode trocar pela régua.
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
  score,
  freshnessNowMs,
  ariaLabel,
}: SpotInstrumentsSectionProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const { hours } = useSpotTimelineData();
  const { index, isNow, setIndex, selectedScore } = useSpotTimelineIndex();

  const rows = useInstrumentRows(spot);
  const rootRef = useRef<HTMLDivElement>(null);
  const paused = useInstrumentPaused(rootRef);
  const [open, setOpen] = useState<InstrumentId | null>(null);

  const tier = getScoreTokens(selectedScore ?? score.score).tier;

  // Valores da hora escolhida: linha do forecast alinhada pelo ISO local;
  // enquanto o ficheiro não chega (ou quando a hora escolhida é «agora» e
  // a linha falhar), o snapshot `conditions` mantém o primeiro paint.
  const hour = useMemo(() => {
    const row = rows?.get(hours[index] ?? '');
    if (row) return rowToInstrumentHour(row);
    if (!rows || isNow) {
      return conditionsToInstrumentHour(conditions);
    }
    return null;
  }, [rows, hours, index, isNow, conditions]);

  const tideSeries = useMemo(() => {
    if (tideHourly?.length) return tideHourly;
    return tidePointsFromRows(hours, rows);
  }, [tideHourly, hours, rows]);

  // Fonte do vento do score (mesma resolução do SpotDetailClient —
  // conditions traz windBias/observed em runtime).
  const scoreWindSource = useMemo(
    () =>
      resolveScoreWindSource(
        conditions as unknown as Record<string, unknown>,
        freshnessNowMs,
      ),
    [conditions, freshnessNowMs],
  );
  const scoreWindCorrection = useMemo(
    () => resolveScoreWindCorrection(conditions as unknown as Record<string, unknown>),
    [conditions],
  );

  // Gancho E2E — ver comentário no cabeçalho.
  useEffect(() => {
    const onSet = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      if (typeof i === 'number' && Number.isFinite(i)) setIndex(i);
    };
    document.addEventListener('ventu:spot-timeline-set', onSet);
    return () => document.removeEventListener('ventu:spot-timeline-set', onSet);
  }, [setIndex]);

  const onToggle = (id: InstrumentId) => setOpen((cur) => (cur === id ? null : id));

  const coherence =
    conditions.observedWaveCoherenceWarning || conditions.observedWaveCoherenceRefused
      ? { text: ti.coherenceMark, linkLabel: ti.coherenceLink }
      : null;

  return (
    <section
      id="instrumentos"
      aria-label={ariaLabel}
      className="scroll-mt-32"
      data-spot-timeline-index={index}
    >
      <h2 className="sr-only">{ariaLabel}</h2>
      <div
        ref={rootRef}
        className={styles.root}
        data-tier={tier}
        data-paused={paused || undefined}
        data-instrument-rows={rows ? 'ready' : 'loading'}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) setOpen(null);
        }}
      >
        <div className={styles.cards}>
          <WindCard
            hour={hour}
            coastOrientation={spot.coastOrientation}
            bestWind={spot.bestWind}
            locale={locale}
            open={open === 'wind'}
            onToggle={onToggle}
          />
          <SwellCard
            hour={hour}
            coastOrientation={spot.coastOrientation}
            bestSwell={spot.bestSwell}
            locale={locale}
            open={open === 'wave'}
            onToggle={onToggle}
            coherence={coherence}
          />
          <TideCard
            tideHourly={tideSeries}
            index={index}
            locale={locale}
            open={open === 'tide'}
            onToggle={onToggle}
          />
        </div>
        {open && (
          <InstrumentDetail
            open={open}
            spot={spot}
            locale={locale}
            conditions={conditions}
            hour={hour}
            tideSchedule={tideSchedule}
            tideHourly={tideHourly}
            freshnessNowMs={freshnessNowMs}
            scoreWindSource={scoreWindSource}
            scoreWindCorrection={scoreWindCorrection}
            copy={copy}
          />
        )}
      </div>
    </section>
  );
}
