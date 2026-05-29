'use client';

import { GraduationCap, TriangleAlert } from 'lucide-react';
import type { Spot } from '@/types';
import { resolveSpotLevelToday } from '@/lib/spotLevelToday';
import { cn } from '@/lib/cn';

interface SpotLevelTodayProps {
  difficulty: Spot['difficulty'];
  score: number;
  locale: string;
  className?: string;
}

export default function SpotLevelToday({
  difficulty,
  score,
  locale,
  className,
}: SpotLevelTodayProps) {
  const resolved = resolveSpotLevelToday(difficulty, score);
  if (!resolved) return null;

  const isPt = locale === 'pt';
  const message = isPt ? resolved.messagePt : resolved.messageEn;
  const Icon = resolved.tone === 'good' ? GraduationCap : TriangleAlert;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
        resolved.tone === 'good'
          ? 'border-score-good/35 bg-score-good/[0.08] text-score-good'
          : 'border-score-poor/35 bg-score-poor/[0.08] text-score-poor',
        className,
      )}
      role="status"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
