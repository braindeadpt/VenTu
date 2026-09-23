import { getTranslation } from '@/lib/i18n';
import { getScoreTokens } from '@/lib/sportScore';
import type { BestWindowToday } from '@/lib/bestWindowToday';
import { formatBestWindowHours } from '@/lib/bestWindow';
import Link from 'next/link';

interface BestWindowBannerProps {
  window: BestWindowToday & { tier?: ReturnType<typeof getScoreTokens>['tier'] };
  spotSlug: string;
  spotName: string;
  locale: string;
  /** Score we should display (can be the peak of the window, or the current). */
  displayScore?: number;
}


/**
 * "Onde está bom hoje?" — Best-window strip with the top spot, score and
 * time-of-day window. Sits inside the hero overlay (sibling of the heading).
 */
export default function BestWindowBanner({
  window,
  spotSlug,
  spotName,
  locale,
  displayScore,
}: BestWindowBannerProps) {
  const t = getTranslation(locale).homepage;
  const score = displayScore ?? window.score;
  const tokens = getScoreTokens(score);
  const tier = window.tier ?? tokens.tier;
  const tierLabel = {
    epic: t.bwTierEpic,
    good: t.bwTierGood,
    fair: t.bwTierFair,
    poor: t.bwTierPoor,
    closed: t.bwTierClosed,
  }[tier];
  const hours = formatBestWindowHours(window, locale);

  return (
    <Link
      href={`/${locale}/spots/${spotSlug}/`}
      className="group inline-flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-pill bg-bg-base/55 backdrop-blur-md border border-divider hover:border-divider-strong transition-colors duration-base ease-out max-w-full"
      aria-label={t.bestWindowAria
        .replace('{tier}', tierLabel)
        .replace('{hours}', hours)
        .replace('{name}', spotName)
        .replace('{score}', String(score))}
    >
      <span
        className={[
          'inline-flex items-center justify-center min-w-[44px] sm:min-w-[52px] h-7 sm:h-8 rounded-pill font-mono font-semibold text-sm sm:text-base px-2',
          tokens.bg,
          tokens.text,
          tokens.border,
          'border',
        ].join(' ')}
      >
        {Math.round(score)}
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-body-sm font-semibold text-fg truncate">
          {tierLabel} {hours}
        </span>
        <span className="text-meta text-fg-muted truncate font-mono tabular-nums">
          {t.bestWindowAt} {spotName}
        </span>
      </div>
    </Link>
  );
}
