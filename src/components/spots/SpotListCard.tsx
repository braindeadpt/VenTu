'use client';

import { Clock, Wind, Waves } from 'lucide-react';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/ui/ScoreBadge';
import { cn } from '@/lib/cn';

export interface SpotListCardConditions {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
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
}: SpotListCardProps) {
  const isPt = locale === 'pt';
  const windKt = Math.round(conditions.windSpeed * 1.94384);

  return (
    <Card
      hoverable
      href={href}
      padding={false}
      className={cn(compact ? 'p-3' : 'p-4', 'flex flex-col gap-2 h-full', className)}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {rank !== undefined && (
            <span
              className="shrink-0 w-6 h-6 rounded-full bg-surface-2 border border-divider flex items-center justify-center font-mono text-meta-sm font-semibold text-fg tabular-nums"
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
        </div>
        <ScoreBadge score={score} locale={locale} size="sm" />
      </div>

      <div className="min-w-0">
        <h3 className={cn('font-semibold text-fg truncate', compact ? 'text-body' : 'text-body')}>
          {name}
        </h3>
        <p className="text-meta-sm text-fg-muted truncate">{region}</p>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta-sm text-fg-muted font-mono tabular-nums mt-auto">
        <span className="inline-flex items-center gap-1">
          <Waves className="w-3 h-3 text-data-waves" aria-hidden />
          {conditions.waveHeight.toFixed(1)}m
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3 text-data-period" aria-hidden />
          {Math.round(conditions.wavePeriod)}s
        </span>
        <span className="inline-flex items-center gap-1">
          <Wind className="w-3 h-3 text-data-wind" aria-hidden />
          {windKt}kt
        </span>
        <span className="sr-only">{isPt ? 'ondas, período, vento' : 'waves, period, wind'}</span>
      </p>
    </Card>
  );
}
