'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Wind, Waves, Zap, Filter, Star, X, RotateCcw, ArrowRight } from 'lucide-react';
import SpotCard from './SpotCard';
import { getMacroRegion, type MacroRegion } from '@/lib/regions';
import { getCompatibleSports, type SportType } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import type { Spot } from '@/types';

// ─── Types ───
interface SpotData {
  spot: Spot;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
  allScores: Record<SportType, any>;
}

// ─── Sport config (Fase 4b order: affinity grouping) ───
const SPORTS: { id: SportType | 'all'; labelPt: string; labelEn: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All', icon: <Star className="w-4 h-4" />, color: 'text-white' },
  { id: 'surf', labelPt: 'Surf', labelEn: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', labelPt: 'Bodyboard', labelEn: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', labelPt: 'Kitesurf', labelEn: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', labelPt: 'Windsurf', labelEn: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'foil', labelPt: 'Foil', labelEn: 'Foil', icon: <Zap className="w-4 h-4" />, color: 'text-sport-foil' },
  { id: 'sup', labelPt: 'SUP', labelEn: 'SUP', icon: <Waves className="w-4 h-4" />, color: 'text-sport-sup' },
  { id: 'wakeboard', labelPt: 'Wakeboard', labelEn: 'Wakeboard', icon: <Zap className="w-4 h-4" />, color: 'text-sport-wakeboard' },
];

const LS_SPORT_KEY = 'windspot:sport';
const LS_REGION_KEY = 'windspot:region';

/**
 * Minimum score to consider a spot "playable" for a specific sport.
 * Threshold 30 sits at the boundary poor→closed (poor = 20-39).
 * A score below 30 means "closed" (0-19) or barely marginal,
 * so we filter it out to avoid showing dead spots.
 */
const PLAYABLE_THRESHOLD = 30;

// ─── Helpers ───
function getSportIcon(sport: SportType | 'all') {
  return SPORTS.find(s => s.id === sport)?.icon || <Star className="w-4 h-4" />;
}

function getSportColor(sport: SportType | 'all') {
  return SPORTS.find(s => s.id === sport)?.color || 'text-white';
}

function getSportLabel(sport: SportType | 'all', isPt: boolean) {
  const s = SPORTS.find(x => x.id === sport);
  return isPt ? s?.labelPt : s?.labelEn;
}

/**
 * Check whether a spot should appear when filtering by a specific sport.
 * Hybrid logic (Opção C): spot must be compatible for the sport AND
 * have a playable score (>= PLAYABLE_THRESHOLD) for that sport.
 * For 'all', no sport filter is applied.
 */
function spotMatchesSportFilter(data: SpotData, sport: SportType | 'all'): boolean {
  if (sport === 'all') return true;
  const compatible = getCompatibleSports(data.spot);
  if (!compatible.includes(sport)) return false;
  const score = data.allScores[sport]?.score ?? 0;
  return score >= PLAYABLE_THRESHOLD;
}

/**
 * Check region filter match.
 */
function spotMatchesRegionFilter(data: SpotData, region: string): boolean {
  if (region === 'Todos') return true;
  const macro = getMacroRegion(data.spot.region);
  return macro === region;
}

/**
 * Get a sport suggestion for the empty state.
 * Returns the sport with most spots that have playable scores,
 * excluding the current sport.
 */
function getAlternativeSport(
  spotsData: SpotData[],
  currentSport: SportType | 'all',
  region: string,
): SportType | null {
  if (currentSport === 'all') return null;
  const counts: Record<string, number> = {};
  for (const data of spotsData) {
    if (!spotMatchesRegionFilter(data, region)) continue;
    for (const sport of Object.keys(data.allScores) as SportType[]) {
      if (sport === currentSport) continue;
      const score = data.allScores[sport]?.score ?? 0;
      if (score >= PLAYABLE_THRESHOLD) {
        counts[sport] = (counts[sport] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? (entries[0][0] as SportType) : null;
}

// ─── Component ───
export function SpotGridClient({
  spotsData,
  locale,
  regions,
  initialSport,
  initialRegion,
}: {
  spotsData: SpotData[];
  locale: string;
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
}) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as any);
  const nextSearch = useSearchParams();

  // ─── Hydration-safe state init ───
  // Priority: URL query param > localStorage > default
  const [selectedSport, setSelectedSport] = useState<SportType | 'all'>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('Todos');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Resolve sport: URL > localStorage > default
    const urlSport = initialSport || nextSearch.get('sport');
    const lsSport = typeof window !== 'undefined' ? localStorage.getItem(LS_SPORT_KEY) : null;
    const resolvedSport = (urlSport as SportType | 'all') || (lsSport as SportType | 'all') || 'all';
    if (SPORTS.some(s => s.id === resolvedSport)) {
      setSelectedSport(resolvedSport);
    }

    // Resolve region: URL > localStorage > default
    const urlRegion = initialRegion || nextSearch.get('region');
    const lsRegion = typeof window !== 'undefined' ? localStorage.getItem(LS_REGION_KEY) : null;
    const resolvedRegion = urlRegion || lsRegion || 'Todos';
    if (regions.includes(resolvedRegion)) {
      setSelectedRegion(resolvedRegion);
    }
  }, [initialSport, initialRegion, nextSearch, regions]);

  // Persist to localStorage when changed by user (not from URL init)
  useEffect(() => {
    if (!mounted) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_SPORT_KEY, selectedSport);
      localStorage.setItem(LS_REGION_KEY, selectedRegion);
    }
  }, [selectedSport, selectedRegion, mounted]);

  // ─── Derived: filtered data ───
  const filtered = useMemo(() => {
    return spotsData.filter(d =>
      spotMatchesSportFilter(d, selectedSport) &&
      spotMatchesRegionFilter(d, selectedRegion)
    );
  }, [spotsData, selectedSport, selectedRegion]);

  // Sort by score of selected sport (descending)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (selectedSport === 'all') {
        // For 'all', sort by best overall score across any sport
        const bestA = Math.max(...Object.values(a.allScores).map((s: any) => s.score || 0));
        const bestB = Math.max(...Object.values(b.allScores).map((s: any) => s.score || 0));
        return bestB - bestA;
      }
      const scoreA = a.allScores[selectedSport]?.score || 0;
      const scoreB = b.allScores[selectedSport]?.score || 0;
      return scoreB - scoreA;
    });
  }, [filtered, selectedSport]);

  // ─── Derived: counts ───
  const onCount = sorted.filter(d => {
    if (selectedSport === 'all') {
      const best = Math.max(...Object.values(d.allScores).map((s: any) => s.score || 0));
      return best >= 70;
    }
    return (d.allScores[selectedSport]?.score || 0) >= 70;
  }).length;

  const marginalCount = sorted.filter(d => {
    if (selectedSport === 'all') {
      const best = Math.max(...Object.values(d.allScores).map((s: any) => s.score || 0));
      return best >= 40 && best < 70;
    }
    const s = d.allScores[selectedSport]?.score || 0;
    return s >= 40 && s < 70;
  }).length;

  // ─── Derived: Top 3 ───
  const top3 = useMemo(() => {
    if (selectedSport === 'all') return [];
    return sorted
      .filter(d => (d.allScores[selectedSport]?.score || 0) >= PLAYABLE_THRESHOLD)
      .slice(0, 3);
  }, [sorted, selectedSport]);

  const top3Count = top3.length;

  // ─── Empty state suggestion ───
  const alternativeSport = useMemo(() => {
    if (sorted.length > 0) return null;
    return getAlternativeSport(spotsData, selectedSport, selectedRegion);
  }, [spotsData, selectedSport, selectedRegion, sorted.length]);

  // ─── Handlers ───
  const handleSportChange = (sport: SportType | 'all') => {
    setSelectedSport(sport);
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
  };

  const handleReset = () => {
    setSelectedSport('all');
    setSelectedRegion('Todos');
  };

  // ─── Render helpers ───
  const sportIcon = getSportIcon(selectedSport);
  const sportColor = getSportColor(selectedSport);
  const sportLabel = getSportLabel(selectedSport, isPt);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" suppressHydrationWarning>
      {/* ─── Sticky Filter Bar ─── */}
      <div className="sticky top-0 z-40 bg-bg-base/90 backdrop-blur-md border-b border-divider -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 mb-6">
        <div className="flex flex-col gap-3">
          {/* Sport pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {SPORTS.map(sport => {
              const active = selectedSport === sport.id;
              return (
                <button
                  key={sport.id}
                  onClick={() => handleSportChange(sport.id)}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
                    'transition-all duration-200 whitespace-nowrap shrink-0',
                    active
                      ? 'bg-surface-2 border border-divider-strong text-fg'
                      : 'bg-surface-1 border border-divider text-fg-muted hover:bg-surface-2 hover:text-fg',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  <span className={active ? sport.color : 'text-fg-muted'}>{sport.icon}</span>
                  <span>{isPt ? sport.labelPt : sport.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Region pills + meta */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 text-fg-muted mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-meta-sm">{isPt ? 'Região' : 'Region'}</span>
              </div>
              {regions.map(region => {
                const active = selectedRegion === region;
                return (
                  <button
                    key={region}
                    onClick={() => handleRegionChange(region)}
                    className={[
                      'inline-flex items-center px-2.5 py-1 rounded-md text-sm',
                      'transition-all duration-200 whitespace-nowrap shrink-0',
                      active
                        ? 'bg-surface-2 border border-divider-strong text-fg font-medium'
                        : 'bg-transparent border border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1',
                    ].join(' ')}
                    aria-pressed={active}
                  >
                    {region}
                  </button>
                );
              })}
            </div>

            {/* Count + reset */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-meta-sm text-fg-muted">
                <span className="font-mono tabular-nums text-fg">{sorted.length}</span>
                {' '}{isPt ? t.hero.spotsCount : t.hero.spotsCount}
                {onCount > 0 && (
                  <span className="ml-2">
                    · <span className="font-mono tabular-nums text-[rgb(var(--score-good))]">{onCount}</span>{' '}
                    {isPt ? t.hero.onCount : 'ON'}
                  </span>
                )}
                {marginalCount > 0 && (
                  <span className="ml-1">
                    · <span className="font-mono tabular-nums text-[rgb(var(--score-fair))]">{marginalCount}</span>{' '}
                    {isPt ? t.hero.marginalCount : t.hero.marginalCount}
                  </span>
                )}
              </span>

              {(selectedSport !== 'all' || selectedRegion !== 'Todos') && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                  aria-label={isPt ? t.hero.clearFilters : t.hero.clearFilters}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isPt ? t.hero.clearFilters : t.hero.clearFilters}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Top 3 para ti ─── */}
      {top3Count > 0 && selectedSport !== 'all' && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className={`${sportColor}`}>{sportIcon}</span>
            <h2 className="text-h2 text-fg">
              {top3Count === 1
                ? `${isPt ? t.hero.top3One : t.hero.top3One} ${sportLabel}`
                : `${isPt ? t.hero.top3 : t.hero.top3} ${sportLabel}`}
              {selectedRegion !== 'Todos' && (
                <span className="text-fg-muted"> {isPt ? 'em' : 'in'} {selectedRegion}</span>
              )}
              {' · '}
              <span className="text-meta text-fg-muted">
                {top3Count === 1
                  ? (isPt ? t.hero.top3OneSub : t.hero.top3OneSub)
                  : (isPt ? t.hero.top3Sub : t.hero.top3Sub)}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((data, idx) => {
              // Bug F fix: pass the score of the SELECTED sport, not primaryScore
              const scoreToShow = data.allScores[selectedSport];
              return (
                <SpotCard
                  key={`top3-${data.spot.id}`}
                  spot={data.spot}
                  conditions={data.conditions}
                  sportScore={scoreToShow}
                  locale={locale}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Section heading for grid ─── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h2 text-fg">
          {isPt ? t.hero.filteredSpots : t.hero.filteredSpots}
          {selectedSport !== 'all' && (
            <span className="text-fg-muted"> · {sportLabel}</span>
          )}
          {selectedRegion !== 'Todos' && (
            <span className="text-fg-muted"> {isPt ? 'em' : 'in'} {selectedRegion}</span>
          )}
        </h2>
        <span className="text-meta text-fg-muted">
          {isPt ? t.hero.sortedByScore : t.hero.sortedByScore}
        </span>
      </div>

      {/* ─── Grid ─── */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((data, idx) => {
            // Bug F fix: pass the score of the SELECTED sport, not primaryScore
            const scoreToShow = selectedSport === 'all'
              ? data.allScores[Object.keys(data.allScores).reduce((a, b) =>
                  (data.allScores[a as SportType]?.score || 0) > (data.allScores[b as SportType]?.score || 0) ? a : b
                ) as SportType]
              : data.allScores[selectedSport];

            return (
              <SpotCard
                key={data.spot.id}
                spot={data.spot}
                conditions={data.conditions}
                sportScore={scoreToShow}
                locale={locale}
              />
            );
          })}
        </div>
      ) : (
        /* ─── Empty state ─── */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-divider flex items-center justify-center mb-4">
            <Filter className="w-8 h-8 text-fg-muted" />
          </div>
          <h3 className="text-h3 text-fg mb-2">
            {isPt
              ? t.hero.noSpotsFound.replace('{sport}', sportLabel || '').replace('{region}', selectedRegion)
              : t.hero.noSpotsFound.replace('{sport}', sportLabel || '').replace('{region}', selectedRegion)}
          </h3>

          {alternativeSport && (
            <p className="text-body text-fg-muted mb-4 max-w-md">
              {isPt
                ? t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt) || '')
                : t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt) || '')}
            </p>
          )}

          <div className="flex items-center gap-3">
            {alternativeSport && (
              <button
                onClick={() => handleSportChange(alternativeSport)}
                className="inline-flex items-center gap-2 h-10 px-4 bg-surface-1 border border-divider hover:border-divider-strong rounded-lg text-fg transition-colors"
              >
                <span className={getSportColor(alternativeSport)}>
                  {getSportIcon(alternativeSport)}
                </span>
                <span>
                  {isPt ? 'Ver' : 'View'} {getSportLabel(alternativeSport, isPt)}
                </span>
              </button>
            )}
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 h-10 px-4 bg-surface-1 border border-divider hover:border-divider-strong rounded-lg text-fg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isPt ? t.hero.clearFilters : t.hero.clearFilters}</span>
            </button>
          </div>

          <Link
            href={`/${locale}/spots/`}
            className="mt-6 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors"
          >
            {isPt ? t.hero.exploreAll : t.hero.exploreAll}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
