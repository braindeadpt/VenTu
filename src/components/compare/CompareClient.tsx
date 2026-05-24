'use client';

import { useState, useEffect, useMemo } from 'react';
import { Trophy, MapPin, Wind, Waves, Clock, ArrowLeft, Crown, Medal, Award, Check, Search, X } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getAllSportScores, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import Link from 'next/link';
import DataSourceBadge from '@/components/ui/DataSourceBadge';

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
}

async function loadSpotBattleData(
  spot: typeof spots[0],
  baseCity: 'lisbon' | 'porto',
  precomputed?: Record<string, PrecomputedCondition> | null,
): Promise<SpotBattleData | null> {
  const driveTime = baseCity === 'lisbon'
    ? getDriveTimeFromLisbon(spot.region)
    : getDriveTimeFromPorto(spot.region);

  const cond = precomputed?.[spot.id];
  if (cond) {
    const conditions = {
      waveHeight: cond.waveHeight || 0,
      wavePeriod: cond.wavePeriod || 0,
      waveDirection: cond.waveDirection || 0,
      windSpeed: cond.windSpeed || 0,
      windDirection: cond.windDirection || 0,
      windGust: cond.windGust || 0,
      waterTemp: cond.waterTemp || 0,
      source: 'real' as const,
      updatedAt: cond.updatedAt,
    };
    return {
      spot,
      conditions,
      allScores: getAllSportScores(spot, conditions),
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
    'Porto': '20 min', 'Viana do Castelo': '1h', 'Braga': '30 min',
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

// Group spots by region
function groupByRegion(spotsList: typeof spots): Map<string, typeof spots> {
  const map = new Map<string, typeof spots>();
  for (const spot of spotsList) {
    const region = spot.region || 'Other';
    if (!map.has(region)) map.set(region, []);
    map.get(region)!.push(spot);
  }
  return map;
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
  }, [slugs, baseCity]);

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
        <div className="max-w-4xl mx-auto px-4 space-y-6">
          <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>

          <div className="text-center space-y-2">
            <Trophy className="w-12 h-12 text-score-fair mx-auto" />
            <h1 className="text-3xl font-bold text-fg">Spot vs Spot</h1>
            <p className="text-fg-muted">{isPt ? 'Escolhe 2-3 spots para comparar' : 'Pick 2-3 spots to compare'}</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isPt ? 'Procurar spot...' : 'Search spot...'}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-divider bg-surface-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-data-waves/30"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">
              {selectedSlugs.length}/3 {isPt ? 'selecionados' : 'selected'}
            </span>
            <div className="flex gap-2">
              {selectedSlugs.length > 0 && (
                <button onClick={() => setSelectedSlugs([])} className="text-sm text-fg-muted hover:text-fg px-3 py-1">
                  <X className="w-4 h-4 inline mr-1" />{isPt ? 'Limpar' : 'Clear'}
                </button>
              )}
              <button
                onClick={startCompare}
                disabled={selectedSlugs.length < 2}
                className="px-4 py-2 rounded-lg bg-data-waves text-bg-base font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-data-waves/80 transition-colors"
              >
                {isPt ? 'Comparar' : 'Compare'}
              </button>
            </div>
          </div>

          <div className="space-y-6 max-h-[60vh] overflow-y-auto">
            {Array.from(regionGroups.entries()).map(([region, regionSpots]) => (
              <div key={region}>
                <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-2">{region}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {regionSpots.map(spot => {
                    const selected = selectedSlugs.includes(spot.slug);
                    return (
                      <button
                        key={spot.id}
                        onClick={() => toggleSpot(spot.slug)}
                        className={[
                          'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                          selected
                            ? 'bg-data-waves/10 border-data-waves text-fg'
                            : 'bg-surface-1 border-divider text-fg-muted hover:bg-surface-2 hover:text-fg',
                          selectedSlugs.length >= 3 && !selected ? 'opacity-50' : '',
                        ].join(' ')}
                        disabled={selectedSlugs.length >= 3 && !selected}
                      >
                        <div className={[
                          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                          selected ? 'bg-data-waves border-data-waves' : 'border-fg-disabled',
                        ].join(' ')}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{isPt ? spot.name : spot.nameEn}</div>
                          <div className="text-xs text-fg-subtle">{spot.region}</div>
                        </div>
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
    return (
      <div className="min-h-screen bg-bg-base p-4 space-y-6 animate-pulse">
        <div className="max-w-4xl mx-auto space-y-4 pt-8">
          <div className="h-10 w-48 bg-surface-1 rounded mx-auto" />
          <div className="h-64 bg-surface-1 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!slugs.length || battleData.length < 2) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <Trophy className="w-16 h-16 text-score-fair mx-auto" />
          <h1 className="text-3xl font-bold text-fg">Spot vs Spot</h1>
          <p className="text-fg-muted">
            {isPt
              ? 'Seleciona 2-3 spots para comparar condições.'
              : 'Pick 2-3 spots to compare conditions.'}
          </p>
          <button
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-data-waves text-bg-base font-medium hover:bg-data-waves/80 transition-colors"
          >
            {isPt ? 'Escolher spots' : 'Choose spots'}
          </button>
        </div>
      </div>
    );
  }

  const sorted = [...battleData].sort((a, b) =>
    (b.allScores[selectedSport]?.score || 0) - (a.allScores[selectedSport]?.score || 0)
  );
  const winner = sorted[0];
  const rankIcons = [Crown, Medal, Award];
  const rankColors = ['text-score-fair', 'text-fg-muted', 'text-score-poor'];

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}/spots/`} className="flex items-center gap-2 text-fg-muted hover:text-fg">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => setBaseCity('lisbon')} className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'lisbon' ? 'bg-data-waves text-bg-base' : 'bg-surface-1 text-fg-muted'}`}>Lisboa</button>
            <button onClick={() => setBaseCity('porto')} className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'porto' ? 'bg-data-waves text-bg-base' : 'bg-surface-1 text-fg-muted'}`}>Porto</button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-fg">Spot vs Spot</h1>
            <p className="text-fg-muted">{isPt ? 'Quem ganha hoje?' : 'Who wins today?'}</p>
          </div>
          <button
            onClick={() => { setPicking(true); setSelectedSlugs(slugs); }}
            className="text-sm text-data-waves hover:underline"
          >
            {isPt ? 'Trocar spots' : 'Change spots'}
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(['surf', 'kitesurf', 'windsurf', 'bodyboard'] as SportType[]).map(sport => (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${selectedSport === sport ? 'bg-surface-2 text-fg border border-divider' : 'bg-surface-1 text-fg-muted hover:bg-surface-2'}`}
            >
              {sport.charAt(0).toUpperCase() + sport.slice(1)}
            </button>
          ))}
        </div>

        <div className="bg-surface-1 backdrop-blur-sm border border-score-fair/30 rounded-2xl p-6 text-center">
          <Crown className="w-8 h-8 text-score-fair mx-auto mb-2" />
          <p className="text-score-fair font-bold mb-2">{isPt ? 'VENCEDOR' : 'WINNER'}</p>
          <h2 className="text-3xl font-bold text-fg">{isPt ? winner.spot.name : winner.spot.nameEn}</h2>
          <p className="text-fg-muted">{isPt ? winner.allScores[selectedSport]?.rating : winner.allScores[selectedSport]?.ratingEn}</p>
          <div className="text-5xl font-bold text-score-fair mt-4">{winner.allScores[selectedSport]?.score}/100</div>
        </div>

        <div className={`grid gap-6 ${sorted.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
          {sorted.map((data, i) => {
            const Icon = rankIcons[i] || Award;
            const colors = getScoreColor(data.allScores[selectedSport]?.score || 0);
            const score = data.allScores[selectedSport];

            return (
              <div key={data.spot.id} className="bg-surface-1 backdrop-blur-sm border border-divider rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-6 h-6 ${rankColors[i]}`} />
                    <DataSourceBadge
                      source={data.conditions.source}
                      updatedAt={data.conditions.updatedAt}
                      locale={locale}
                    />
                  </div>
                  <span className={`text-3xl font-bold ${colors.text}`}>#{i + 1}</span>
                </div>

                <h3 className="text-xl font-bold text-fg">{isPt ? data.spot.name : data.spot.nameEn}</h3>
                <p className="text-sm text-fg-muted">{data.spot.region}</p>

                <div className="text-center my-4">
                  <div className={`text-4xl font-bold ${colors.text}`}>{score?.score || 0}</div>
                  <div className="text-xs text-fg-muted">/100</div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-fg-muted flex items-center gap-1"><Waves className="w-4 h-4" />{isPt ? 'Ondas' : 'Waves'}</span>
                    <span className="font-bold">{data.conditions.waveHeight.toFixed(1)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted flex items-center gap-1"><Wind className="w-4 h-4" />{isPt ? 'Vento' : 'Wind'}</span>
                    <span className="font-bold">{(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted flex items-center gap-1"><Clock className="w-4 h-4" />{isPt ? 'Condução' : 'Drive'}</span>
                    <span className="text-data-waves">{data.driveTime}</span>
                  </div>
                </div>

                <Link href={`/${locale}/spots/${data.spot.slug}/?sport=${selectedSport}`} className="mt-4 block w-full text-center py-3 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl font-medium transition-all">
                  {isPt ? 'Ver Detalhes' : 'View Details'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
