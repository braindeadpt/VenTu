'use client';

import { scoreToNota } from '@/lib/nota';
import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { getTranslation } from '@/lib/i18n';
import { useMemo } from 'react';
import Link from 'next/link';
import { Sun, Waves, Wind, ArrowRight } from 'lucide-react';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import {
  getScoreForFilter,
  type HomepageSpotData,
  getSportLabel,
} from '@/lib/homepageSport';
import { getScoreTokens } from '@/lib/sportScore';
import {
  formatBestWindowHours,
} from '@/lib/bestWindow';
import { resolveBestWindowForSport } from '@/lib/bestWindowToday';
import Button from '@/components/ui/Button';
import { compararJanelas, janelaSeguinte, linhaDeNoite } from '@/lib/noiteListas';
import { JanelaNoite, LuaNoite } from '@/components/ui/NoiteJanela';

interface YourDaySectionProps {
  locale: string;
  spotsData: HomepageSpotData[];
  favoriteIds: string[];
  activeSport?: GridSportFilter;
  /** Relógio do estado «Noite» (o do build até montar, depois o real). */
  nowMs?: number | null;
}

export default function YourDaySection({
  locale,
  spotsData,
  favoriteIds,
  activeSport = 'all',
  nowMs = null,
}: YourDaySectionProps) {
  const t = getTranslation(locale).homepage;
  const isPt = locale === 'pt';

  const cards = useMemo(() => {
    const byId = new Map(spotsData.map((d) => [d.spot.id, d]));
    const sport = activeSport;

    return favoriteIds
      .map((id) => byId.get(id))
      .filter((d): d is HomepageSpotData => Boolean(d))
      .map((data) => {
        // For 'all': use the best score across compatible sports
        let sportScore: number;
        let bestSport: SportType;
        if (sport === 'all') {
          const compatible = data.spot.compatibleSports ?? ['surf' as SportType];
          let maxScore = 0;
          let maxS: SportType = compatible[0] || 'surf';
          for (const s of compatible) {
            const sc = getScoreForFilter(data, s as GridSportFilter);
            if (sc > maxScore) { maxScore = sc; maxS = s; }
          }
          sportScore = maxScore;
          bestSport = maxS;
        } else {
          sportScore = getScoreForFilter(data, sport as GridSportFilter);
          bestSport = sport as SportType;
        }
        const window = resolveBestWindowForSport(
          data.bestWindowToday,
          data.bestWindowsBySport,
          // Big Wave lê o surf (D8, #218): a janela é a do surf
          sport === 'big-wave' ? 'surf' : sport === 'all' ? bestSport : (sport as SportType),
        );
        // Noite (opção A, 28/10): lua + próxima janela em vez de «0/10»
        const noite = linhaDeNoite(data, sport);
        const janela = noite ? janelaSeguinte(data, sport, nowMs) : null;
        return { data, sport: noite && janela ? janela.sport : bestSport, score: sportScore, window, noite, janela };
      })
      .sort((a, b) => {
        // de dia pela nota; de noite pela próxima janela (dia, nota, início), as de dia à frente
        if (a.noite !== b.noite) return a.noite ? 1 : -1;
        if (a.noite) return compararJanelas(a.janela, b.janela);
        return b.score - a.score;
      });
  }, [favoriteIds, spotsData, activeSport, nowMs]);

  // Empty state
  if (cards.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="rounded-card border border-divider bg-surface-1/[0.04] p-6 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-pill bg-accent/15 text-accent mx-auto" aria-hidden>
            <Sun className="w-5 h-5" />
          </div>
          <h2 className="font-display text-h2 text-fg font-semibold">
            {t.yourDay}
          </h2>
          <p className="text-body text-fg-muted max-w-sm mx-auto">
            {t.addFavoritesHint}
          </p>
          <Button
            variant="primary"
            size="md"
            href={`/${locale}/spots/`}
            locale={locale}
          >
            {t.exploreSpots}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4"
      aria-labelledby="your-day-heading"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Sun className="w-5 h-5 text-accent" aria-hidden />
          <h2
            id="your-day-heading"
            className="font-display text-display-lg text-fg tracking-tight"
          >
            {t.yourDay}
          </h2>
          <span className="text-meta-sm text-fg-muted font-mono tabular-nums">
            · {cards.length} spot{cards.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Link
          href={`/${locale}/spots/`}
          className="text-meta-sm text-data-waves hover:text-data-waves/80 transition-colors"
        >
          {t.editFavorites}
        </Link>
      </div>

      <ul className="space-y-2 list-none p-0 m-0">
        {cards.map(({ data, sport, score, window, noite, janela }, i) => {
          const name = localizedSpotName(data.spot, locale);
          const tokens = getScoreTokens(score);
          const sportLabel = getSportLabel(sport, locale);
          const windKt = Math.round(data.conditions.windSpeed * 1.94384);
          const waveM = data.conditions.waveHeight.toFixed(1);

          return (
            <li
              key={data.spot.id}
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': i * 30 } as React.CSSProperties}
            >
              <Link
                href={spotDetailHref(locale, data.spot.slug, sport)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-card border border-divider bg-surface-1/[0.04] hover:bg-surface-2/[0.08] hover:border-divider-strong transition-all duration-150 ease-out group"
              >
                {/* Score pill (de noite, a lua) */}
                {noite ? (
                  <LuaNoite size={40} locale={locale} className="min-w-[44px]" />
                ) : (
                <span
                  className={[
                    'shrink-0 flex items-center justify-center min-w-[44px] h-10 rounded-pill font-mono font-semibold text-sm tabular-nums border',
                    tokens.bg,
                    tokens.text,
                    tokens.border,
                  ].join(' ')}
                  aria-label={`${sportLabel}: ${scoreToNota(score)}/10`}
                >
                  {scoreToNota(score)}
                </span>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-semibold text-fg truncate">
                      {name}
                    </span>
                    <span className={['text-meta-sm font-medium', noite ? 'text-fg-muted' : tokens.text].join(' ')}>
                      {sportLabel}
                    </span>
                  </div>
                  {noite ? (
                    <div className="mt-0.5 text-meta-sm" data-noite="">
                      <JanelaNoite janela={janela} locale={locale} />
                    </div>
                  ) : (
                  <div className="flex items-center gap-2 text-meta-sm text-fg-muted font-mono tabular-nums mt-0.5">
                    {window && (
                      <>
                        <span className="text-data-waves">{formatBestWindowHours(window, locale)}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    <span className="flex items-center gap-1">
                      <Waves className="w-3 h-3 text-data-waves" aria-hidden />
                      {waveM}m
                    </span>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1">
                      <Wind className="w-3 h-3 text-data-wind" aria-hidden />
                      {windKt}kt
                    </span>
                  </div>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-fg-subtle group-hover:text-fg transition-colors shrink-0" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
