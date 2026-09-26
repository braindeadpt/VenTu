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
 * O índice escolhido reflecte-se em data-spot-timeline-index no contentor;
 * os specs mudam a hora pelo slider da régua (role="slider"), que é o
 * mesmo caminho do utilizador — sem ganchos de teste em produção.
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
  const { hours, nowIndex } = useSpotTimelineData();
  const { index, isNow, selectedScore } = useSpotTimelineIndex();

  const rows = useInstrumentRows(spot);
  const rootRef = useRef<HTMLDivElement>(null);
  const paused = useInstrumentPaused(rootRef);
  const [open, setOpen] = useState<InstrumentId | null>(null);
  // O miolo do acordeão fica montado durante o fecho — a animação
  // grid-template-rows 1fr→0fr (240 ms, globals.css) precisa do conteúdo.
  const [detailId, setDetailId] = useState<InstrumentId | null>(null);
  useEffect(() => {
    if (open || !detailId) return undefined;
    const t = window.setTimeout(() => setDetailId(null), 280);
    return () => window.clearTimeout(t);
  }, [open, detailId]);

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

  const onToggle = (id: InstrumentId) => {
    // Monta o painel no mesmo commit da abertura (0fr→1fr anima com
    // conteúdo); no fecho o timeout do efeito desmonta após a transição.
    const next = open === id ? null : id;
    if (next) setDetailId(next);
    setOpen(next);
  };

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
      // «true» quando o eixo já aterrou na hora actual (relógio vivo). Antes
      // disso mostra a hora do build (padrão mounted+bakedAtMs) — quem lê o
      // índice tem de esperar por isto, não por data-instrument-rows.
      data-spot-timeline-live={nowIndex >= 0 ? 'true' : 'false'}
    >
      <h2 className="sr-only">{ariaLabel}</h2>
      <div
        ref={rootRef}
        className="ventu-inst"
        data-tier={tier}
        data-paused={paused || undefined}
        data-instrument-rows={rows ? 'ready' : 'loading'}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) setOpen(null);
        }}
      >
        <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
          <WindCard
            hour={hour}
            spot={spot}
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
            tideSchedule={tideSchedule}
            index={index}
            locale={locale}
            open={open === 'tide'}
            onToggle={onToggle}
          />
        </div>
        <div className="ventu-inst-acc" data-open={open ? '' : undefined}>
          <div className="ventu-inst-acc-inner">
            {detailId && (
              <InstrumentDetail
                open={detailId}
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
        </div>
      </div>
    </section>
  );
}
