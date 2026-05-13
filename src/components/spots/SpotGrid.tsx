'use client';

import { useState, useMemo } from 'react';
import { Spot } from '@/types';
import { SportType } from '@/lib/sportRatings';
import SpotCard from './SpotCard';
import { Filter, MapPin, Wind, Waves, Zap } from 'lucide-react';

interface SpotGridProps {
  spots: Spot[];
  locale: string;
  conditions?: Record<string, {
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  }>;
  sportScores?: Record<string, Record<SportType, {
    score: number;
    rating: string;
    ratingEn: string;
    factors: string[];
    primaryFactor: string;
  }>>;
  selectedSport?: SportType | null;
}

const SPORTS: { id: SportType | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all', label: 'Todos', icon: Waves, color: 'text-fg' },
  { id: 'surf', label: 'Surf', icon: Waves, color: 'text-data-waves' },
  { id: 'kitesurf', label: 'Kitesurf', icon: Wind, color: 'text-data-waves' },
  { id: 'windsurf', label: 'Windsurf', icon: Wind, color: 'text-data-waves' },
  { id: 'bodyboard', label: 'Bodyboard', icon: Waves, color: 'text-data-waves' },
  { id: 'sup', label: 'SUP', icon: Waves, color: 'text-data-waves' },
  { id: 'wakeboard', label: 'Wakeboard', icon: Zap, color: 'text-data-waves' },
];

import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';

export default function SpotGrid({ spots, locale, conditions = {}, sportScores = {}, selectedSport: initialSport }: SpotGridProps) {
  const [selectedSport, setSelectedSport] = useState<SportType | 'all'>(initialSport || 'all');
  const [selectedRegion, setSelectedRegion] = useState('Todos');

  const isPt = locale === 'pt';

  // Filter spots
  const filteredSpots = useMemo(() => {
    return spots.filter(spot => {
      const sportMatch = selectedSport === 'all' || 
        (sportScores[spot.id]?.[selectedSport]?.score || 0) > 0 ||
        spot.compatibleSports?.includes(selectedSport);
      
      const regionMatch = selectedRegion === 'Todos' || getMacroRegion(spot.region) === selectedRegion;
      
      return sportMatch && regionMatch;
    });
  }, [spots, selectedSport, selectedRegion, sportScores]);

  // Sort by score for selected sport
  const sortedSpots = useMemo(() => {
    if (selectedSport === 'all') return filteredSpots;
    
    return [...filteredSpots].sort((a, b) => {
      const scoreA = sportScores[a.id]?.[selectedSport]?.score || 0;
      const scoreB = sportScores[b.id]?.[selectedSport]?.score || 0;
      return scoreB - scoreA;
    });
  }, [filteredSpots, selectedSport, sportScores]);

  return (
    <div className="space-y-6">
      {/* Sport filters */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        <Filter className="w-4 h-4 text-fg-subtle shrink-0" />
        {SPORTS.map((sport) => {
          const Icon = sport.icon;
          const isActive = selectedSport === sport.id;
          return (
            <button
              key={sport.id}
              onClick={() => setSelectedSport(sport.id as SportType | 'all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-surface-2 text-fg border border-divider' 
                  : 'bg-surface-1 text-fg-muted hover:bg-surface-2 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? sport.color : 'text-fg-subtle'}`} />
              {sport.label}
            </button>
          );
        })}
      </div>

      {/* Region filters */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        <MapPin className="w-4 h-4 text-fg-subtle shrink-0" />
        {MACRO_REGIONS.map((region) => {
          const isActive = selectedRegion === region;
          return (
            <button
              key={region}
              onClick={() => setSelectedRegion(region)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-surface-2 text-fg border border-divider' 
                  : 'bg-surface-1 text-fg-muted hover:bg-surface-2 border border-transparent'
              }`}
            >
              {region === 'Todos' ? (isPt ? 'Todos' : 'All') : region}
            </button>
          );
        })}
      </div>

      {/* Results count */}
      <div className="text-sm text-fg-muted">
        {sortedSpots.length} {isPt ? 'spots encontrados' : 'spots found'}
        {selectedSport !== 'all' && ` • ${SPORTS.find(s => s.id === selectedSport)?.label}`}
        {selectedRegion !== 'Todos' && ` • ${selectedRegion}`}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedSpots.map((spot) => {
          // When 'all' is selected, show the best score across any sport
          let scoreToShow = selectedSport !== 'all' ? sportScores[spot.id]?.[selectedSport] : undefined;
          let sportToShow: SportType | undefined = selectedSport !== 'all' ? selectedSport : undefined;

          if (selectedSport === 'all') {
            const scores = sportScores[spot.id];
            if (scores) {
              let bestScore = -1;
              for (const [sport, data] of Object.entries(scores)) {
                const s = (data as any)?.score ?? 0;
                if (s > bestScore) {
                  bestScore = s;
                  scoreToShow = data as any;
                  sportToShow = sport as SportType;
                }
              }
            }
          }

          return (
            <SpotCard
              key={spot.id}
              spot={spot}
              locale={locale}
              conditions={conditions[spot.id]}
              sportScore={scoreToShow}
              selectedSport={sportToShow}
            />
          );
        })}
      </div>
    </div>
  );
}
