'use client';

import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { getScoreCssVar } from '@/lib/scoreThresholds';
import { formatHourLabel } from '@/lib/verdict/formatHourLabel';
import { cn } from '@/lib/cn';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import SportTab from '@/components/spots/SportTab';

interface SpotUnifiedBarProps {
  locale: string;
  /** Lista canónica de modalidades (compatíveis do spot). */
  tabSports: SportType[];
  allScores: Record<SportType, SportScore>;
  selectedSport: SportType;
  onSelectSport: (sport: SportType) => void;
  /** aria-label da tablist (tv.sportTabsAria). */
  sportTabsAria: string;
  /** Score «agora» — fallback antes de o eixo montar. */
  nowScoreFallback: number;
}

const ANCHORS: ReadonlyArray<{ href: string; key: 'anchorNow' | 'anchorForecast' | 'anchorOnSite' | 'anchorGettingThere' }> = [
  { href: '#agora', key: 'anchorNow' },
  { href: '#previsao', key: 'anchorForecast' },
  { href: '#no-local', key: 'anchorOnSite' },
  { href: '#chegar', key: 'anchorGettingThere' },
];

/**
 * §2 do contrato — UMA barra fixa: tabs de modalidade com mini-score
 * (roving ←/→ igual à linha antiga), score e hora da hora escolhida no
 * eixo partilhado, e âncoras para as secções. Pina na cota partilhada
 * `--ventu-spot-sticky-top` com altura `--ventu-spot-tabs-h`. Substitui a
 * dupla SpotStickyBar + linha standalone — só existe um tablist na página.
 */
export default function SpotUnifiedBar({
  locale,
  tabSports,
  allScores,
  selectedSport,
  onSelectSport,
  sportTabsAria,
  nowScoreFallback,
}: SpotUnifiedBarProps) {
  const tv = getTranslation(locale).spotPageVerdict;
  const { nowIndex } = useSpotTimelineData();
  const { selectedScore, selectedHour, isNow } = useSpotTimelineIndex();

  const shownScore = selectedScore ?? nowScoreFallback;

  // ←/→ na tablist: roving tabs, foco segue a selecção (mesma semântica da
  // linha standalone que esta barra substitui).
  const handleTabsKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = tabSports.indexOf(selectedSport);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabSports[(idx + dir + tabSports.length) % tabSports.length];
    onSelectSport(next);
    e.currentTarget
      .querySelector<HTMLButtonElement>(`#sport-tab-${next}`)
      ?.focus();
  };

  return (
    <div
      role="region"
      aria-label={tv.barLabel}
      className="sticky z-30 border-b border-divider bg-bg-base supports-[backdrop-filter]:md:bg-bg-base/95 supports-[backdrop-filter]:md:backdrop-blur-sm"
      style={{
        top: 'var(--ventu-spot-sticky-top)',
        '--verdict': `rgb(var(${getScoreCssVar(shownScore)}))`,
      } as React.CSSProperties}
    >
      <div
        className="max-w-6xl mx-auto px-4 flex items-center gap-3"
        style={{ height: 'var(--ventu-spot-tabs-h)' }}
      >
        <div
          role="tablist"
          aria-label={sportTabsAria}
          onKeyDown={handleTabsKeyDown}
          style={{ height: 'var(--ventu-spot-tabs-h)' }}
          className="flex items-center gap-1.5 -mx-4 px-4 min-w-0 flex-1 overflow-x-auto overscroll-x-contain no-scrollbar edge-fade-x"
        >
          {tabSports.map((sport) => (
            <SportTab
              key={sport}
              sport={sport}
              score={allScores[sport].score}
              active={selectedSport === sport}
              onClick={() => onSelectSport(sport)}
              locale={locale}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid="spot-bar-score"
            className="font-mono text-num-sm font-semibold tabular-nums rounded-pill border border-divider-strong px-1.5 py-0.5"
            style={{ color: 'var(--verdict)' }}
            data-visual-dynamic
          >
            {shownScore}
          </span>
          <span className="font-mono text-num-sm tabular-nums text-fg">
            {selectedHour ? formatHourLabel(selectedHour, locale) : '--:--'}
          </span>
          {nowIndex >= 0 && (
            <span
              className={cn(
                'hidden sm:inline rounded-pill border px-1.5 py-0.5 text-meta-sm',
                isNow ? 'border-divider-strong text-fg' : 'border-divider text-fg-muted',
              )}
            >
              {isNow ? tv.nowLabel : tv.forecastLabel}
            </span>
          )}
        </div>

        <nav
          aria-label={tv.navLabel}
          className="hidden lg:flex items-center gap-1 shrink-0"
        >
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="inline-flex items-center px-2 min-h-[44px] -my-2 text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150"
            >
              {tv[a.key]}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
