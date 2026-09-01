'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock, Wind, Waves } from 'lucide-react';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { Spot } from '@/types';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/ui/ScoreBadge';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import SpotImage from '@/components/ui/SpotImage';
import ScoreWaveSourceBadge from '@/components/ui/ScoreWaveSourceBadge';
import WaveCalibrationTag from '@/components/ui/WaveCalibrationTag';
import WaveSourceAttributionNote from '@/components/ui/WaveSourceAttributionNote';
import WarningPill from '@/components/ui/WarningPill';
import { getSpotListCardHoverLine } from '@/lib/spotListCardDelight';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';
import { waveFactorSuffix, type ScoreWaveCorrection } from '@/lib/scoreConditions';
import type { ObservedWave } from '@/lib/observedWave';
import { formatObservedClockTime } from '@/lib/observations';
import { cn } from '@/lib/cn';

export interface SpotListCardConditions {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
}

interface SpotListCardProps {
  name: string;
  region: string;
  score: number;
  conditions: SpotListCardConditions;
  href: string;
  locale: 'pt' | 'en';
  sportLabel?: string;
  sportAccent?: string;
  rank?: number;
  compact?: boolean;
  className?: string;
  calmWaterLabel?: string | null;
  withImage?: boolean;
  spot?: Pick<Spot, 'slug' | 'type' | 'images' | 'name' | 'nameEn' | 'region'>;
  statusLine?: string;
  /** Active sea-state/wind IPMA warning — small badge on the card. */
  warning?: MapMarkerWarning | null;
  /**
   * Wave correction (resolveScoreWaveCorrection) — renders the
   * «Corrigido pela boia X» badge with ME/n in the metrics row (TopNow).
   */
  waveCorrection?: ScoreWaveCorrection | null;
  /**
   * observedAt da leitura da boia — quando a correcção é 'observed', mostra o
   * relógio HH:MM junto à altura (mesmo data-wave-clock do hero/sticky).
   */
  observedWaveAt?: string | null;
  /**
   * Tipo da leitura observada (ih-buoy | wmo-buoy) — para mostrar a nota de
   * atribuição (ex. Copernicus quando a boia é WMO/espanhola) junto da altura
   * da onda observada nestes cards, como no card de onda observada.
   */
  observedWaveSource?: 'ih-buoy' | 'wmo-buoy' | null;
  /**
   * Calibração cross-border da leitura (observedWave.calibration — boia ES
   * recalibrada à referência PT): o tag compacto «ref. PT (-0.9 m · n=4)»
   * mostra-o junto do score, como no hero/sticky, quando o card não tem o
   * contexto do hero (TopNow, grid).
   */
  observedWaveCalibration?: ObservedWave['calibration'] | null;
}

export default function SpotListCard({
  name,
  region,
  score,
  conditions,
  href,
  locale,
  sportLabel,
  sportAccent,
  rank,
  compact = false,
  className,
  calmWaterLabel = null,
  withImage = false,
  spot,
  statusLine,
  warning,
  waveCorrection,
  observedWaveAt,
  observedWaveSource,
  observedWaveCalibration,
}: SpotListCardProps) {
  const isPt = locale === 'pt';
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const hoverLine = getSpotListCardHoverLine(score, isPt);
  // Sufixo honesto da altura: «(boia)» / «(viés regional)» quando a correcção
  // foi aplicada (a altura mostrada É a corrigida); '' para previsão pura.
  const waveSource = waveCorrection?.source ?? 'forecast';
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    setMotionOk(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const handleParallax = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!motionOk || !withImage) return;
    const el = imageWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setParallax({ x: px * 6, y: py * 4 });
  };

  const resetParallax = () => setParallax({ x: 0, y: 0 });

  return (
    <div
      className={cn('group h-full', className)}
      onMouseMove={handleParallax}
      onMouseLeave={resetParallax}
    >
      <Card
        hoverable
        href={href}
        padding={false}
        className={cn(
          compact ? 'p-3' : 'p-4',
          'flex flex-col gap-2 h-full overflow-hidden',
        )}
      >
        {withImage && spot && (
          <div ref={imageWrapRef} className="relative overflow-hidden rounded-lg shrink-0">
            <div
              className={cn(
                'transition-[transform,filter] duration-200 ease-out motion-safe:will-change-transform',
                motionOk && 'group-hover:scale-[1.04] group-hover:saturate-[1.15]',
              )}
              style={
                motionOk
                  ? {
                      transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0)`,
                    }
                  : undefined
              }
            >
              <SpotImage spot={spot} aspect="video" locale={locale} className="w-full" scrim />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {rank !== undefined && (
              <span
                className="shrink-0 w-6 h-6 rounded-full bg-surface-2/[0.08] border border-divider flex items-center justify-center font-mono text-meta-sm font-semibold text-fg tabular-nums"
                aria-hidden
              >
                {rank}
              </span>
            )}
            {sportLabel && (
              <span
                className="pill pill-ghost gap-1 px-2 py-0.5 min-h-0 text-meta-sm sport-accent shrink-0"
                data-sport={sportAccent}
              >
                {sportLabel}
              </span>
            )}
            {warning && (
              <WarningPill warning={warning} locale={locale} variant="mini" />
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreBadge score={score} locale={locale} size="sm" />
            {conditions.confidence && (
              <ConfidenceBadge
                confidence={conditions.confidence}
                detail={conditions.confidenceDetail}
                locale={locale}
                size="sm"
                withTooltip={false}
              />
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="font-display font-semibold text-fg truncate text-body">{name}</h3>
          <p className="text-meta-sm text-fg-muted truncate">{region}</p>
          {statusLine && (
            <p className="text-meta-sm text-fg-subtle mt-0.5 capitalize">{statusLine}</p>
          )}
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta-sm text-fg-muted font-mono tabular-nums mt-auto">
          {calmWaterLabel ? (
            <span className="inline-flex items-center gap-1 text-fg-subtle normal-case font-sans">
              <Waves className="w-3 h-3 text-data-waves" aria-hidden />
              {calmWaterLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Waves className="w-3 h-3 text-data-waves" aria-hidden />
              {conditions.waveHeight.toFixed(1)}m{waveFactorSuffix(waveSource, locale)}
              {/* Relógio da leitura (HH:MM, Europe/Lisbon) — mesmo data-wave-clock
                  do hero, só quando a correcção é de boia fresca ('observed'). */}
              {waveSource === 'observed' && observedWaveAt ? (
                <>
                  <span aria-hidden className="text-fg-subtle">
                    ·
                  </span>
                  <span className="text-fg-subtle" data-wave-clock="true">
                    {formatObservedClockTime(observedWaveAt, locale)}
                  </span>
                </>
              ) : null}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-data-period" aria-hidden />
            {Math.round(conditions.wavePeriod)}s
          </span>
          <span className="inline-flex items-center gap-1">
            <Wind className="w-3 h-3 text-data-wind" aria-hidden />
            {windKt}kt
          </span>
          {waveCorrection &&
            (waveCorrection.source === 'observed' || waveCorrection.source === 'bias-corrected') && (
              <ScoreWaveSourceBadge
                source={waveCorrection.source}
                correction={waveCorrection}
                locale={locale}
                className="shrink-0"
              />
            )}
          {observedWaveCalibration && waveSource === 'observed' && (
            <WaveCalibrationTag
              wave={{ calibration: observedWaveCalibration, waveHeight: conditions.waveHeight }}
              locale={locale}
              className="shrink-0"
            />
          )}
          <span className="sr-only">{isPt ? 'ondas, período, vento' : 'waves, period, wind'}</span>
          {/* Nota de atribuição junto da leitura observada WMO/boia espanhola
              (Copernicus) — mesma cadeia da tabela de /fontes, via ATTRIBUTIONS.
              Só quando a altura mostrada é a da boia E essa boia é WMO/Copernicus. */}
          {waveSource === 'observed' && observedWaveSource === 'wmo-buoy' ? (
            <WaveSourceAttributionNote
              source="wmo-buoy"
              locale={locale}
              className="basis-full min-w-0"
            />
          ) : null}
        </p>

        {hoverLine && (
          <p
            className={cn(
              'flex items-center gap-1 text-meta-sm font-medium text-data-waves',
              'opacity-0 translate-y-1 transition-all duration-200 ease-out',
              'group-hover:opacity-100 group-hover:translate-y-0',
              'group-focus-within:opacity-100 group-focus-within:translate-y-0',
              'motion-reduce:opacity-100 motion-reduce:translate-y-0',
            )}
            aria-hidden
          >
            {hoverLine}
            <ArrowRight className="w-3.5 h-3.5" />
          </p>
        )}
      </Card>
    </div>
  );
}
