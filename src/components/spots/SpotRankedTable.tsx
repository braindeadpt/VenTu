'use client';

import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';
import type { Locale } from '@/lib/i18n';
import { getTranslation } from '@/lib/i18n';
import { getScoreTokens, getScoreTierLabel } from '@/lib/sportScore';
import { getGridSpotScore, spotDetailHref } from '@/lib/gridSpotScore';
import { getCalmWaterMetricLabel } from '@/lib/spotWaterContext';
import {
  directionInSectorList,
  getCardinalLabel,
  getWindRelationToCoast,
  type WindRelation,
} from '@/lib/wind';
import { resolveBestWindowForSport } from '@/lib/bestWindowToday';
import { phaseFromConditionsStatus, TIDE_PHASE_CELL } from '@/lib/tideSchedule';
import type { TidePhase } from '@/lib/tideSchedule';
import { cn } from '@/lib/cn';

interface SpotRankedTableProps {
  sorted: GridSpotData[];
  selectedSport: GridSportFilter;
  locale: string;
  /** Section heading overrides — home reuses the table as «Top 8 · Surf». */
  title?: string;
  subtitle?: string;
}

function windowSport(sport: GridSportFilter): SportType | 'all' {
  if (sport === 'big-wave') return 'surf';
  return sport;
}

const WIND_RELATION_TEXT: Record<WindRelation, string> = {
  offshore: 'text-windDir-offshore',
  onshore: 'text-windDir-onshore',
  cross: 'text-windDir-cross',
};

const WIND_RELATION_LABEL: Record<WindRelation, { pt: string; en: string }> = {
  offshore: { pt: 'off', en: 'off' },
  onshore: { pt: 'on', en: 'on' },
  cross: { pt: 'cross', en: 'cross' },
};

/**
 * Directório denso — uma linha por spot, ranked pelo score do filtro activo.
 * É a resposta tipo Windguru a «onde está a boa onda agora?»: score, mar,
 * vento vs costa, maré e a melhor janela 24h sem abrir cada spot.
 */
export default function SpotRankedTable({
  sorted,
  selectedSport,
  locale,
  title,
  subtitle,
}: SpotRankedTableProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as Locale);
  const router = useRouter();
  const wSport = windowSport(selectedSport);

  return (
    <section className="mb-10" aria-labelledby="spot-table-heading">
      <div className="mb-3">
        <h2 id="spot-table-heading" className="text-h3 text-fg">
          {title ?? t.ranked.spotRanking}
        </h2>
        <p className="text-meta text-fg-muted mt-1">
          {subtitle ??
            (isPt
              ? 'Ordenados por score · filtros activos'
              : 'Sorted by score · active filters')}
        </p>
      </div>

      <div
        role="region"
        aria-label={t.ranked.tableAria}
        tabIndex={0}
        className="overflow-x-auto rounded-card border border-divider bg-surface-1/[0.03] edge-fade-x"
      >
        <table className="w-full border-collapse text-meta">
          <caption className="sr-only">
            {isPt
              ? 'Spots ordenados por score com ondas, direcção, vento, maré e melhor janela'
              : 'Spots ranked by score with waves, direction, wind, tide and best window'}
          </caption>
          <thead>
            <tr className="border-b border-divider text-left text-meta-sm text-fg-subtle">
              <th scope="col" className="py-2 pl-3 pr-1 font-medium w-8">
                <span aria-hidden>#</span>
                <span className="sr-only">{t.ranked.rank}</span>
              </th>
              <th scope="col" className="py-2 px-2 font-medium">
                Score
              </th>
              <th scope="col" className="py-2 px-2 font-medium">
                Spot
              </th>
              <th scope="col" className="py-2 px-2 font-medium whitespace-nowrap">
                {getTranslation(locale).homepage.layerWaves}
              </th>
              <th scope="col" className="py-2 px-2 font-medium hidden md:table-cell">
                <span title={t.spots.idealSwell}>Dir.</span>
              </th>
              <th scope="col" className="py-2 px-2 font-medium whitespace-nowrap">
                {getTranslation(locale).homepage.layerWind}
              </th>
              <th scope="col" className="py-2 px-2 font-medium hidden lg:table-cell">
                {t.ranked.tideWord}
              </th>
              <th scope="col" className="py-2 pl-2 pr-3 font-medium whitespace-nowrap">
                {t.ranked.windowWord}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((data, i) => {
              const { spot, conditions } = data;
              const score = getGridSpotScore(data, selectedSport);
              const tokens = getScoreTokens(score);
              const href = spotDetailHref(locale, spot.slug, selectedSport);
              const name = localizedSpotName(spot, locale);
              const region = localizedSpotRegion(spot, locale);
              const calmLabel = getCalmWaterMetricLabel(spot, conditions.waveHeight, locale);
              const swellMatch = directionInSectorList(
                conditions.waveDirection,
                spot.bestSwell,
              );
              const windKt = Math.round(conditions.windSpeed * 1.94384);
              const relation = getWindRelationToCoast(
                conditions.windDirection,
                spot.coastOrientation,
              );
              const tidePhase = phaseFromConditionsStatus(
                conditions.tideStatus as TidePhase | undefined,
              );
              const tideCell = tidePhase ? TIDE_PHASE_CELL[tidePhase] : undefined;
              const bestWindow = resolveBestWindowForSport(
                data.bestWindowToday,
                data.bestWindowsBySport,
                wSport,
              );

              return (
                <tr
                  key={spot.id}
                  onClick={() => router.push(href)}
                  className="border-b border-divider/60 last:border-0 cursor-pointer transition-colors duration-150 hover:bg-surface-2/[0.06]"
                >
                  <td className="py-2 pl-3 pr-1 font-mono tabular-nums text-fg-subtle">
                    {i + 1}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={cn('font-mono font-semibold tabular-nums', tokens.text)}
                      title={getScoreTierLabel(tokens.tier, locale)}
                    >
                      {score}
                    </span>
                  </td>
                  <td className="py-2 px-2 min-w-0">
                    <Link
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-fg hover:text-accent transition-colors duration-150"
                    >
                      {name}
                    </Link>
                    <span className="block text-meta-sm text-fg-muted truncate">
                      {region}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">
                    {calmLabel ? (
                      <span className="text-fg-muted font-sans">{calmLabel}</span>
                    ) : (
                      <>
                        <span className="text-fg">{conditions.waveHeight.toFixed(1)}m</span>
                        <span className="text-fg-subtle">
                          {' '}@ {Math.round(conditions.wavePeriod)}s
                        </span>
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap hidden md:table-cell">
                    {swellMatch === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span
                        className={swellMatch ? 'text-score-good' : 'text-fg-muted'}
                        title={`${t.spots.idealSwell}: ${spot.bestSwell}`}
                      >
                        {getCardinalLabel(conditions.waveDirection)}
                        {swellMatch ? ' ✓' : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">
                    <span className="text-fg">{windKt}kt</span>{' '}
                    <span className={cn('text-meta-sm font-sans', WIND_RELATION_TEXT[relation])}>
                      {WIND_RELATION_LABEL[relation][isPt ? 'pt' : 'en']}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap hidden lg:table-cell">
                    {tideCell ? (
                      <span className="text-fg-muted">
                        {tideCell[locale as Locale] ?? tideCell.en}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                    {bestWindow ? (
                      <span className="text-fg">
                        {String(bestWindow.start).padStart(2, '0')}–{String(bestWindow.end).padStart(2, '0')}h
                        <span
                          className={cn('ml-1.5 text-meta-sm', getScoreTokens(bestWindow.score).text)}
                        >
                          {bestWindow.score}
                        </span>
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
