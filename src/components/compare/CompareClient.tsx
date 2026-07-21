'use client';

import { useState, useEffect, useMemo } from 'react';
import { Trophy, Wind, Waves, Clock, ArrowLeft, Crown, Medal, Award, Check, Search, X } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getAllSportScores, getScoreTokens } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import Link from 'next/link';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import FilterPill from '@/components/ui/FilterPill';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { rawToScoreInput } from '@/lib/scoreConditions';

interface SpotBattleData {
  spot: typeof spots[0];
  conditions: ReturnType<typeof getCurrentConditions>;
  allScores: Record<SportType, any>;
  driveTime: string;
}

interface PrecomputedCondition {
  waveHeight?: number;
  wavePeriod?: number;
  waveDirection?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  waterTemp?: number;
  updatedAt?: string;
  observed?: unknown;
}

const COMPARE_SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'bodyboard'];

async function loadSpotBattleData(
  spot: typeof spots[0],
  baseCity: 'lisbon' | 'porto',
  precomputed?: Record<string, PrecomputedCondition> | null,
): Promise<SpotBattleData | null> {
  const driveTime = baseCity === 'lisbon'
    ? getDriveTimeFromLisbon(spot.region)
    : getDriveTimeFromPorto(spot.region);

  const dataId = getConditionsDataId(spot);
  const cond = precomputed?.[dataId] ?? precomputed?.[spot.id];
  if (cond) {
    const scoreInput = rawToScoreInput(cond as Record<string, unknown>);
    const conditions = {
      ...scoreInput,
      source: 'real' as const,
      updatedAt: cond.updatedAt,
    };
    return {
      spot,
      conditions,
      allScores: getAllSportScores(spot, scoreInput),
      driveTime,
    };
  }

  try {
    const result = await fetchMarineData(spot.lat, spot.lon);
    const conditions = getCurrentConditions(result);
    return {
      spot,
      conditions,
      allScores: getAllSportScores(spot, conditions),
      driveTime,
    };
  } catch {
    return null;
  }
}

function getDriveTimeFromLisbon(region: string): string {
  const times: Record<string, string> = {
    'Cascais': '30 min', 'Lisboa': '20 min', 'Peniche': '1h 15min',
    'Ericeira': '45 min', 'Nazaré': '1h 30min', 'Algarve': '2h 30min',
    'Alentejo': '1h 45min', 'Porto': '3h', 'Braga': '3h 30min',
    'Madeira': '1h 30min (avion)', 'São Miguel': '2h 30min (avion)',
  };
  return times[region] || '—';
}

function getDriveTimeFromPorto(region: string): string {
  const times: Record<string, string> = {
    'Porto': '20 min', 'Viana do Castelo': '1h', 'Braga': '30 min', 'Esposende': '45 min',
    'Caminha': '1h 15min', 'Peniche': '2h 30min', 'Ericeira': '3h',
    'Lisboa': '3h 15min', 'Cascais': '3h 30min', 'Nazaré': '2h',
    'Algarve': '5h', 'Madeira': '1h 30min (avion)',
  };
  return times[region] || '—';
}

function getSpotsFromUrl(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const params = new URLSearchParams(window.location.search);
    const spotsParam = params.get('spots');
    return spotsParam ? spotsParam.split(',').filter(Boolean) : [];
  } catch { return []; }
}

function getLocaleFromPath(): string {
  if (typeof window === 'undefined') return 'pt';
  try {
    const match = window.location.pathname.match(/^\/(pt|en)\//);
    return match ? match[1] : 'pt';
  } catch { return 'pt'; }
}

function groupByRegion(spotsList: typeof spots): Map<string, typeof spots> {
  const map = new Map<string, typeof spots>();
  for (const spot of spotsList) {
    const region = spot.region || 'Other';
    if (!map.has(region)) map.set(region, []);
    map.get(region)!.push(spot);
  }
  return map;
}

function CompareLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-64 mx-auto md:mx-0" />
          <Skeleton className="h-5 w-40 mx-auto md:mx-0" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-11 w-24 rounded-pill" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-card" />
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CompareClient() {
  const [battleData, setBattleData] = useState<SpotBattleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<SportType>('surf');
  const [baseCity, setBaseCity] = useState<'lisbon' | 'porto'>('lisbon');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [locale, setLocale] = useState('pt');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const urlSlugs = getSpotsFromUrl();
    setSlugs(urlSlugs);
    setLocale(getLocaleFromPath());
    setPicking(urlSlugs.length === 0);
  }, []);

  const isPt = locale === 'pt';

  useEffect(() => {
    if (!slugs.length) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    const selectedSpots = slugs
      .map(slug => spots.find(s => s.slug === slug))
      .filter(Boolean) as typeof spots;

    (async () => {
      let precomputed: Record<string, PrecomputedCondition> | null = null;
      try {
        const response = await fetch(getAssetPath('/data/conditions.json'), { cache: 'no-store' });
        if (response.ok) {
          precomputed = await response.json();
        }
      } catch {
        // Fall back to live Open-Meteo per spot
      }

      const results = await Promise.all(
        selectedSpots.map((spot) => loadSpotBattleData(spot, baseCity, precomputed)),
      );

      if (!cancelled) {
        setBattleData(results.filter(Boolean) as SpotBattleData[]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [slugs, baseCity, retryKey]);

  const startCompare = () => {
    if (selectedSlugs.length < 2) return;
    const url = `/${locale}/compare/?spots=${selectedSlugs.join(',')}`;
    window.history.pushState({}, '', url);
    setSlugs([...selectedSlugs]);
    setLoading(true);
    setPicking(false);
  };

  const toggleSpot = (slug: string) => {
    setSelectedSlugs(prev => {
      if (prev.includes(slug)) return prev.filter(s => s !== slug);
      if (prev.length >= 3) return prev;
      return [...prev, slug];
    });
  };

  const filteredSpots = useMemo(() => {
    if (!searchQuery.trim()) return spots;
    const q = searchQuery.toLowerCase();
    return spots.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.nameEn.toLowerCase().includes(q) ||
      s.region.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const regionGroups = useMemo(() => groupByRegion(filteredSpots), [filteredSpots]);

  if (picking) {
    return (
      <div className="min-h-screen bg-bg-base py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
          <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>

          <PageHeader
            align="center"
            icon={<Trophy className="w-12 h-12 text-score-epic" aria-hidden />}
            title="Spot vs Spot"
            subtitle={isPt ? 'Escolhe 2-3 spots para comparar' : 'Pick 2-3 spots to compare'}
          />

          <Input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isPt ? 'Procurar spot...' : 'Search spot...'}
            icon={<Search className="w-4 h-4" />}
          />

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-meta text-fg-muted">
              {selectedSlugs.length}/3 {isPt ? 'selecionados' : 'selected'}
            </span>
            <div className="flex gap-2">
              {selectedSlugs.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedSlugs([])}>
                  <X className="w-4 h-4" aria-hidden />
                  {isPt ? 'Limpar' : 'Clear'}
                </Button>
              )}
              <Button size="sm" onClick={startCompare} disabled={selectedSlugs.length < 2}>
                {isPt ? 'Comparar' : 'Compare'}
              </Button>
            </div>
          </div>

          <div className="space-y-6 max-h-[60vh] overflow-y-auto">
            {Array.from(regionGroups.entries()).map(([region, regionSpots]) => (
              <div key={region}>
                <h3 className="text-meta-sm font-semibold text-fg-muted uppercase tracking-wide mb-2">{region}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {regionSpots.map(spot => {
                    const selected = selectedSlugs.includes(spot.slug);
                    const atLimit = selectedSlugs.length >= 3 && !selected;
                    return (
                      <button
                        key={spot.id}
                        type="button"
                        onClick={() => toggleSpot(spot.slug)}
                        aria-pressed={selected}
                        disabled={atLimit}
                        className={[
                          'flex items-center gap-3 p-3 rounded-card border text-left transition-all min-h-[44px]',
                          selected
                            ? 'bg-data-waves/10 border-data-waves text-fg'
                            : 'card-1 text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg',
                          atLimit ? 'opacity-50 cursor-not-allowed' : '',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                            selected ? 'bg-data-waves border-data-waves' : 'border-fg-disabled',
                          ].join(' ')}
                          aria-hidden
                        >
                          {selected && <Check className="w-3 h-3 text-bg-base" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{isPt ? spot.name : spot.nameEn}</span>
                          <span className="block text-xs text-fg-subtle">{spot.region}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <CompareLoadingSkeleton />;
  }

  if (slugs.length >= 2 && battleData.length < 2) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          <ErrorState
            locale={locale}
            onRetry={() => {
              setLoading(true);
              setRetryKey(k => k + 1);
            }}
          />
        </div>
      </div>
    );
  }

  if (!slugs.length || battleData.length < 2) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <PageHeader
            align="center"
            icon={<Trophy className="w-16 h-16 text-score-epic" aria-hidden />}
            title="Spot vs Spot"
            subtitle={
              isPt
                ? 'Seleciona 2-3 spots para comparar condições.'
                : 'Pick 2-3 spots to compare conditions.'
            }
          />
          <Button size="lg" onClick={() => setPicking(true)}>
            {isPt ? 'Escolher spots' : 'Choose spots'}
          </Button>
        </div>
      </div>
    );
  }

  const sorted = [...battleData].sort((a, b) =>
    (b.allScores[selectedSport]?.score || 0) - (a.allScores[selectedSport]?.score || 0)
  );
  const winner = sorted[0];
  const winnerScore = winner.allScores[selectedSport]?.score || 0;
  const winnerTokens = getScoreTokens(winnerScore);
  const rankIcons = [Crown, Medal, Award];
  const rankColors = ['text-score-epic', 'text-score-good', 'text-score-fair'];

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          <div className="flex items-center gap-2">
            <FilterPill active={baseCity === 'lisbon'} onClick={() => setBaseCity('lisbon')}>
              Lisboa
            </FilterPill>
            <FilterPill active={baseCity === 'porto'} onClick={() => setBaseCity('porto')}>
              Porto
            </FilterPill>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            title="Spot vs Spot"
            subtitle={isPt ? 'Quem ganha hoje?' : 'Who wins today?'}
          />
          <button
            type="button"
            onClick={() => { setPicking(true); setSelectedSlugs(slugs); }}
            className="text-sm text-data-waves hover:underline shrink-0"
          >
            {isPt ? 'Trocar spots' : 'Change spots'}
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar edge-fade-x pb-1">
          {COMPARE_SPORTS.map(sport => (
            <FilterPill
              key={sport}
              active={selectedSport === sport}
              onClick={() => setSelectedSport(sport)}
            >
              {SPORT_LABELS[sport][isPt ? 'pt' : 'en']}
            </FilterPill>
          ))}
        </div>

        <div className={`card-1 p-6 text-center border ${winnerTokens.border} ${winnerTokens.glow}`}>
          <Crown className={`w-8 h-8 ${winnerTokens.text} mx-auto mb-2`} aria-hidden />
          <p className={`text-meta-sm font-bold uppercase tracking-wide ${winnerTokens.text} mb-2`}>
            {isPt ? 'Vencedor' : 'Winner'}
          </p>
          <h2 className="text-h2 text-fg">{isPt ? winner.spot.name : winner.spot.nameEn}</h2>
          <p className="text-fg-muted mt-1">
            {isPt ? winner.allScores[selectedSport]?.rating : winner.allScores[selectedSport]?.ratingEn}
          </p>
          <div className={`text-display-lg font-mono tabular-nums ${winnerTokens.text} mt-4`}>
            {winnerScore}/100
          </div>
        </div>

        <div className={`grid gap-6 ${sorted.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
          {sorted.map((data, i) => {
            const Icon = rankIcons[i] || Award;
            const scoreValue = data.allScores[selectedSport]?.score || 0;
            const tokens = getScoreTokens(scoreValue);
            const score = data.allScores[selectedSport];

            return (
              <article key={data.spot.id} className="card-1 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-6 h-6 ${rankColors[i] ?? 'text-fg-muted'}`} aria-hidden />
                    <DataSourceBadge
                      source={data.conditions.source}
                      updatedAt={data.conditions.updatedAt}
                      locale={locale}
                    />
                  </div>
                  <span className={`text-h2 font-mono tabular-nums ${tokens.text}`}>#{i + 1}</span>
                </div>

                <h3 className="text-h3 text-fg">{isPt ? data.spot.name : data.spot.nameEn}</h3>
                <p className="text-meta text-fg-muted">{data.spot.region}</p>

                <div className="text-center my-4">
                  <div className={`text-display-lg font-mono tabular-nums ${tokens.text}`}>{score?.score || 0}</div>
                  <div className="text-meta-sm text-fg-muted">/100</div>
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-fg-muted flex items-center gap-1">
                      <Waves className="w-4 h-4" aria-hidden />
                      {isPt ? 'Ondas' : 'Waves'}
                    </dt>
                    <dd className="font-mono tabular-nums font-semibold text-fg">{data.conditions.waveHeight.toFixed(1)}m</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-muted flex items-center gap-1">
                      <Wind className="w-4 h-4" aria-hidden />
                      {isPt ? 'Vento' : 'Wind'}
                    </dt>
                    <dd className="font-mono tabular-nums font-semibold text-fg">{(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-muted flex items-center gap-1">
                      <Clock className="w-4 h-4" aria-hidden />
                      {isPt ? 'Condução' : 'Drive'}
                    </dt>
                    <dd className="text-data-waves font-medium">{data.driveTime}</dd>
                  </div>
                </dl>

                <Button
                  href={`/${locale}/spots/${data.spot.slug}/?sport=${selectedSport}`}
                  className="mt-4 w-full"
                >
                  {isPt ? 'Ver detalhes' : 'View details'}
                </Button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
