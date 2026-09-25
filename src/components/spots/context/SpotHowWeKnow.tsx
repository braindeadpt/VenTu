'use client';

import { AlertTriangle } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import type { Spot } from '@/types';
import type { SportScore } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import type { SpotDashboardConditions } from '@/components/spots/SpotConditionsDashboard';
import type { ConfidenceDetail, ConfidenceTier, DailyConfidence } from '@/types';
import { getConfidenceLabel } from '@/lib/forecastConfidence';
import { isObservedWaveFresh } from '@/lib/observedWave';
import {
  resolveScoreWaveSource,
  resolveScoreWaveCorrection,
  resolveScoreWindSource,
  resolveScoreWindCorrection,
} from '@/lib/scoreConditions';
import ProvenanceRow from '@/components/ui/ProvenanceRow';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import ScoreWaveSourceBadge from '@/components/ui/ScoreWaveSourceBadge';
import ScoreWindSourceBadge from '@/components/ui/ScoreWindSourceBadge';
import WindSourceAttributionNote from '@/components/ui/WindSourceAttributionNote';
import ObservedWaveSourcesChip from '@/components/spots/ObservedWaveSourcesChip';
import SpotModelBand from '@/components/spots/context/SpotModelBand';
import ScoreFeedback from '@/components/spots/ScoreFeedback';
import FeedbackForm from '@/components/FeedbackForm';

/**
 * Secção 7 «Como sabemos» (SPOT-PAGE.md) — proveniência, confiança,
 * coerência e feedback. As props conditions/score/selectedSport são
 * opcionais nesta sessão: a S3 liga-as a partir do SpotDetailClient
 * (lista em «Dúvidas» do relatório). Sem elas a secção degrada para o
 * FeedbackForm — nunca inventa dados.
 */

/** Condições como o SpotDetailClient as tem em runtime — o tipo do
 *  dashboard mais os campos de proveniência que a §7 consome. */
export type SpotContextConditions = SpotDashboardConditions & {
  source?: 'real' | 'mock';
  updatedAt?: string | null;
  confidence?: ConfidenceTier | null;
  confidenceDetail?: ConfidenceDetail | null;
  dailyConfidence?: DailyConfidence[];
};

export interface SpotHowWeKnowProps {
  spot: Spot;
  locale: string;
  conditions?: SpotContextConditions;
  score?: SportScore;
  selectedSport?: SportType;
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  freshnessNowMs?: number;
}

/** Recusa cross-border (par ES×PT incoherent hoje) — o mesmo aviso que o
 *  dashboard mostra junto do card de onda, aqui em texto completo. */
function CoherenceRefusedNotice({ esCode, locale }: { esCode: string; locale: string }) {
  const tv = getTranslation(locale).spotVerify;
  return (
    <p
      className="flex items-start gap-1.5 rounded-card border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-meta-sm text-data-period leading-snug"
      data-coherence-refused="true"
      title={tv.coerRefusedTitle.replace('{esCode}', esCode)}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>{tv.coerRefusedBody}</span>
    </p>
  );
}

/** Confiança baixa da leitura nacional — par ES×PT incoherent há N+ dias
 *  (arquivo diário): a leitura IH primária fica sob suspeita mas não é
 *  bloqueada. Texto completo, destino final do aviso na página. */
function CoherenceWarningNotice({
  warning,
  locale,
}: {
  warning: {
    esCode: string;
    ptRefCode?: string;
    days: number;
    firstDay?: string | null;
    lastDay?: string | null;
  };
  locale: string;
}) {
  const tv = getTranslation(locale).spotVerify;
  const title = tv.coerWarnTitle
    .replace('{esCode}', warning.esCode)
    .replace('{ref}', warning.ptRefCode ? ` × ${warning.ptRefCode}` : '')
    .replace('{days}', String(warning.days))
    .replace('{first}', warning.firstDay ?? '…')
    .replace('{last}', warning.lastDay ?? '…');
  return (
    <p
      className="flex items-start gap-1.5 rounded-card border border-score-fair/30 bg-score-fair/10 px-2 py-1.5 text-meta-sm text-score-fair leading-snug"
      data-coherence-warning="true"
      title={title}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>{tv.coerWarnBody.replace('{days}', String(warning.days))}</span>
    </p>
  );
}

export default function SpotHowWeKnow({
  spot,
  locale,
  conditions,
  score,
  selectedSport,
  freshnessNowMs,
}: SpotHowWeKnowProps) {
  const tc = getTranslation(locale).spotPageContext;
  const td = getTranslation(locale).spotDetail;
  const isPt = locale === 'pt';

  const raw = conditions as unknown as Record<string, unknown> | undefined;
  const scoreWaveSource = raw ? resolveScoreWaveSource(raw, freshnessNowMs) : undefined;
  const scoreWaveCorrection = raw ? resolveScoreWaveCorrection(raw, freshnessNowMs) : undefined;
  const scoreWindSource = raw ? resolveScoreWindSource(raw, freshnessNowMs) : undefined;
  const scoreWindCorrection = raw ? resolveScoreWindCorrection(raw) : undefined;
  const windObservedSource = conditions?.observed?.source;
  const observedWave = conditions?.observedWave;
  const waveFresh =
    observedWave && isObservedWaveFresh(observedWave, freshnessNowMs);
  const daily = conditions?.dailyConfidence;

  return (
    <div className="space-y-3">
      {/* Detalhe técnico do número grande da onda — banda ensemble por família
          e erro do modelo por horizonte. A caixa é estável: passar a régua não
          muda a altura da secção. */}
      <SpotModelBand spot={spot} locale={locale} />

      {conditions && scoreWaveSource && scoreWindSource && (
        <div className="space-y-2.5" data-testid="how-we-know-sources">
          <h3 className="text-meta-sm font-semibold text-fg-subtle uppercase tracking-wide">
            {tc.sourcesTitle}
          </h3>
          {/* UX v3 §8 — os badges abrem popovers: alvos tácteis ≥44 px. */}
          <ProvenanceRow align="start" className="[&_button]:min-h-11">
            <ScoreWaveSourceBadge
              source={scoreWaveSource}
              correction={scoreWaveCorrection}
              locale={locale}
            />
            <ScoreWindSourceBadge
              source={scoreWindSource}
              correction={scoreWindCorrection}
              locale={locale}
            />
            <ConfidenceBadge
              confidence={conditions.confidence}
              detail={conditions.confidenceDetail}
              locale={locale}
              size="sm"
            />
            {conditions.source && (
              <DataSourceBadge
                source={conditions.source}
                updatedAt={conditions.updatedAt}
                locale={locale}
                size="sm"
                nowMs={freshnessNowMs}
              />
            )}
          </ProvenanceRow>

          {scoreWindSource === 'observed' &&
            (windObservedSource ?? scoreWindCorrection?.source) && (
              <WindSourceAttributionNote
                source={windObservedSource ?? scoreWindCorrection!.source!}
                locale={isPt ? 'pt' : 'en'}
              />
            )}

          {waveFresh && (
            <ObservedWaveSourcesChip
              observedWave={observedWave}
              altWave={conditions.observedWaveAlt}
              meta={conditions.observedWaveMeta}
              locale={locale}
              freshnessNowMs={freshnessNowMs}
            />
          )}

          {daily && daily.length > 0 && (
            <div>
              <h4 className="text-meta-sm font-semibold text-fg-subtle uppercase tracking-wide mb-1">
                {tc.dailyConfidence}
              </h4>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5 list-none p-0 m-0">
                {daily.slice(0, 5).map((d) => (
                  <li key={d.date} className="text-meta-sm text-fg-muted">
                    <span className="font-mono tabular-nums">
                      {new Date(`${d.date}T12:00:00`).toLocaleDateString(
                        isPt ? 'pt-PT' : 'en-GB',
                        { weekday: 'short', day: 'numeric', month: 'short' },
                      )}
                    </span>
                    {' · '}
                    {getConfidenceLabel(d.confidence, locale)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {conditions.observedWaveCoherenceWarning && (
            <CoherenceWarningNotice
              warning={conditions.observedWaveCoherenceWarning}
              locale={locale}
            />
          )}
          {conditions.observedWaveCoherenceRefused && (
            <CoherenceRefusedNotice
              esCode={conditions.observedWaveCoherenceRefused.esCode}
              locale={locale}
            />
          )}
        </div>
      )}

      {conditions && score && selectedSport && (
        <div>
          <p className="text-meta-sm text-fg-subtle mb-1.5">{td.scoreFeedbackHint}</p>
          <ScoreFeedback
            spotSlug={spot.slug}
            sport={selectedSport}
            predictedScore={score.score}
            conditionsSnapshot={{
              waveHeight: conditions.waveHeight,
              wavePeriod: conditions.wavePeriod,
              windSpeed: conditions.windSpeed,
              windDirection: conditions.windDirection,
              waterTemp: conditions.waterTemp,
            }}
            locale={locale}
          />
        </div>
      )}

      <FeedbackForm locale={locale} defaultSpotSlug={spot.slug} />
    </div>
  );
}
