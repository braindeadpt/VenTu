'use client';

import { Waves, Wind, Droplets, Clock } from 'lucide-react';
import { getScoreTokens } from '@/lib/sportScore';
import type { SportScore } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import {
  isObservedWaveFresh,
  observedWaveLabel,
  waveCalibrationTag,
  type ObservedWave,
  type ObservedWaveMeta,
} from '@/lib/observedWave';
import ObservedWaveSourcesChip from '@/components/spots/ObservedWaveSourcesChip';
import ScoreWaveSourceBadge from '@/components/ui/ScoreWaveSourceBadge';
import { waveFactorSuffix, type ScoreWaveCorrection } from '@/lib/scoreConditions';
import { formatObservedClockTime } from '@/lib/observations';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import {
  SEA_STATE_WARNING_TYPES,
  strongestSpotWarning,
  warningBadgeLabel,
} from '@/lib/ipmaWarnings';
import WarningPill from '@/components/ui/WarningPill';
import SportTab from '@/components/spots/SportTab';

interface SpotStickyBarProps {
  score: SportScore;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    waterTemp: number;
  };
  /** Sport label of the selected sport (score pill). */
  sportLabel: string;
  /** The bars (sport tabs + metrics) take over the top line when the hero leaves viewport. */
  active: boolean;
  /** Locale. */
  locale: string;
  /** Spot id — resolves the active IPMA warning chip («Mar perigoso»). */
  spotId: string;
  /** Sport tabs — same list as the standalone tabs line (replaced while active). */
  sports: SportType[];
  /** Scores of all sports (each tab shows its own score). */
  allScores: Record<SportType, SportScore>;
  /** Currently selected sport. */
  selectedSport: SportType;
  /** Switch sport from the bar. */
  onSelectSport: (sport: SportType) => void;
  /** Optional fresh buoy reading — compact «boia X a Y km» chip. */
  observedWave?: ObservedWave | null;
  /** Runner-up source (WMO when IH won) — side-by-side chip when both fresh. */
  observedWaveAlt?: ObservedWave | null;
  /** Why the winner was chosen (freshness/distance) — attached by the merge. */
  observedWaveMeta?: ObservedWaveMeta | null;
  /**
   * Wave correction (resolveScoreWaveCorrection, já calculado pelo client) —
   * «Corrigido pela boia X» com ME/n, mesmo caminho do hero.
   */
  scoreWaveCorrection?: ScoreWaveCorrection | null;
}

/**
 * Sticky condensed bar that takes over the top line just under the header
 * (which held the sport tabs) when the user scrolls past the hero — mobile AND
 * desktop. It shows the sport tabs (replacing the standalone tabs line, which
 * goes `invisible` in the parent while this is active) plus the condensed
 * metrics: score, 4 stat chips and the observed-wave/warning chips.
 *
 * Visibility is decided by the parent via `useSpotHeroScrolledPast` and passed
 * in as `active`, so the standalone tabs line and this bar never diverge.
 */
export default function SpotStickyBar({
  score,
  conditions,
  sportLabel,
  active,
  locale,
  spotId,
  sports,
  allScores,
  selectedSport,
  onSelectSport,
  observedWave,
  observedWaveAlt,
  observedWaveMeta,
  scoreWaveCorrection,
}: SpotStickyBarProps) {
  const isPt = locale === 'pt';
  const warningsData = useIpmaWarnings();
  const warning = strongestSpotWarning(warningsData, spotId);

  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const tokens = getScoreTokens(score.score);
  const waveSource = scoreWaveCorrection?.source ?? 'forecast';
  // Altura que o score usou: a medição da boia quando 'observed', senão a row
  // (já corrigida pelo viés regional quando aplicável) — mesma lógica do hero.
  const waveHeightShown =
    waveSource === 'observed' && observedWave
      ? observedWave.waveHeight
      : conditions.waveHeight;

  if (!active) return null;

  return (
    <div
      role="region"
      aria-label={isPt ? 'Métricas principais' : 'Key metrics'}
      className="fixed left-0 right-0 z-30 bg-bg-base/95 supports-[backdrop-filter]:backdrop-blur-md border-b border-divider"
      style={{ top: '64px' }}
    >
      {/* Sport tabs — substituem a linha standalone (que o pai torna invisible
          quando esta barra está activa): a troca de desporto continua acessível
          em scroll profundo, numa única fila. */}
      <div className="border-b border-divider/60">
        <div
          role="tablist"
          aria-label={isPt ? 'Modalidade' : 'Sport'}
          className="max-w-6xl mx-auto px-4 flex items-center gap-2 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 edge-fade-x"
        >
          {sports.map((sport) => (
            <SportTab
              key={sport}
              sport={sport}
              score={allScores[sport]?.score ?? 0}
              active={selectedSport === sport}
              onClick={() => onSelectSport(sport)}
              locale={locale}
            />
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-2 h-14 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <div
          className={[
            'shrink-0 flex items-center justify-center min-w-[36px] h-8 rounded-pill border font-mono font-semibold text-xs px-1.5 tabular-nums',
            tokens.bg,
            tokens.text,
            tokens.border,
          ].join(' ')}
          aria-label={`${sportLabel} score ${score.score}`}
        >
          {score.score}
        </div>
        <Stat
          icon={<Waves className="w-3 h-3 text-data-waves" />}
          value={`${waveHeightShown.toFixed(1)}m${waveFactorSuffix(waveSource, locale)}`}
          label={isPt ? 'Onda' : 'Wave'}
        />
        <Stat icon={<Clock className="w-3 h-3 text-data-period" />} value={`${Math.round(conditions.wavePeriod)}s`} label={isPt ? 'Período' : 'Period'} />
        <Stat icon={<Wind className="w-3 h-3 text-data-wind" />} value={`${windKt}kt`} label={isPt ? 'Vento' : 'Wind'} />
        <Stat icon={<Droplets className="w-3 h-3 text-data-water" />} value={`${conditions.waterTemp.toFixed(1)}°`} label={isPt ? 'Água' : 'Water'} />
        {observedWave &&
          isObservedWaveFresh(observedWave) &&
          (observedWaveAlt && isObservedWaveFresh(observedWaveAlt) ? (
            <ObservedWaveSourcesChip
              observedWave={observedWave}
              altWave={observedWaveAlt}
              meta={observedWaveMeta}
              locale={locale}
            />
          ) : (
            <Stat
              icon={<Waves className="w-3 h-3 text-score-good" />}
              value={observedWaveLabel(observedWave, locale)}
              label={isPt ? 'medida' : 'measured'}
              // Hora da leitura apenas no tooltip — a barra de 56px não ganha
              // espaço visual (mesmo clock do hero, Europe/Lisbon).
              title={
                isPt
                  ? `${observedWaveLabel(observedWave, locale)} · leitura ${formatObservedClockTime(observedWave.observedAt, locale)}`
                  : `${observedWaveLabel(observedWave, locale)} · reading ${formatObservedClockTime(observedWave.observedAt, locale)}`
              }
            />
          ))}
        {observedWave &&
          isObservedWaveFresh(observedWave) &&
          !(observedWaveAlt && isObservedWaveFresh(observedWaveAlt)) &&
          (() => {
            const calTag = waveCalibrationTag(observedWave, locale);
            return calTag ? (
              <span
                className="shrink-0 inline-flex items-center gap-1 rounded-pill border border-data-period/30 bg-data-period/10 px-2 py-1 font-medium whitespace-nowrap text-meta-sm text-data-period"
                title={calTag.title}
                data-wave-calibrated="compact"
              >
                {calTag.label}
              </span>
            ) : null;
          })()}
        {scoreWaveCorrection &&
          (scoreWaveCorrection.source === 'observed' ||
            scoreWaveCorrection.source === 'bias-corrected') && (
            <ScoreWaveSourceBadge
              source={scoreWaveCorrection.source}
              correction={scoreWaveCorrection}
              locale={locale}
              className="shrink-0"
            />
          )}
        {warning && (
          <WarningPill
            warning={{
              level: warning.level,
              label: warningBadgeLabel(warning, isPt),
              seaState: SEA_STATE_WARNING_TYPES.has(warning.type),
              areaLabel: warning.areaLabel,
              type: warning.type,
            }}
            locale={locale}
            variant="compact"
            dataAttr="compact"
          />
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  title,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  /** Optional tooltip (e.g. the buoy reading time) — no visual space. */
  title?: string;
}) {
  return (
    <div
      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-pill bg-surface-1/[0.04] border border-divider"
      title={title}
    >
      {icon}
      <span className="font-mono tabular-nums text-meta font-medium text-fg">{value}</span>
      <span className="text-meta-sm text-fg-muted hidden sm:inline">{label}</span>
    </div>
  );
}