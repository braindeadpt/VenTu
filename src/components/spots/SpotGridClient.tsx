'use client';

import { useState, useMemo } from 'react';
import {
  Wind, Waves, Zap, Filter, Star,
} from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getMacroRegion } from '@/lib/regions';
import SpotCard from '@/components/spots/SpotCard';

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
  allScores: Record<string, any>;
}

interface SportConfig {
  id: SportType | 'all';
  label: string;
  icon: React.ElementType;
  color: string;
}

const SPORTS: SportConfig[] = [
  { id: 'all', label: 'Todos', icon: Star, color: 'text-white' },
  { id: 'surf', label: 'Surf', icon: Waves, color: 'text-cyan-400' },
  { id: 'kitesurf', label: 'Kitesurf', icon: Wind, color: 'text-sky-400' },
  { id: 'windsurf', label: 'Windsurf', icon: Wind, color: 'text-blue-400' },
  { id: 'bodyboard', label: 'Bodyboard', icon: Waves, color: 'text-teal-400' },
  { id: 'sup', label: 'SUP', icon: Waves, color: 'text-emerald-400' },
  { id: 'wakeboard', label: 'Wakeboard', icon: Zap, color: 'text-purple-400' },
];

interface SpotGridClientProps {
  spotsData: SpotData[];
  locale: string;
  regions: string[];
}

export function SpotGridClient({ spotsData, locale, regions }: SpotGridClientProps) {
  const isPt = locale === 'pt';
  const [selectedSport, setSelectedSport] = useState<SportType | 'all'>('all');
  const [selectedRegion, setSelectedRegion] = useState('Todos');

  const filteredSpots = useMemo(() => {
    return spotsData.filter((data) => {
      const sportMatch = selectedSport === 'all' || (data.allScores[selectedSport]?.score || 0) > 0;
      const regionMatch = selectedRegion === 'Todos' || getMacroRegion(data.spot.region) === selectedRegion;
      return sportMatch && regionMatch;
    });
  }, [spotsData, selectedSport, selectedRegion]);

  return (
    <>
      {/* Filter Bar */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-white/5 py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 overflow-x-auto no-scrollbar">
          <Filter className="w-4 h-4 text-white/40 shrink-0" />
          
          <div className="flex items-center gap-2 shrink-0">
            {SPORTS.map((sport) => {
              const Icon = sport.icon;
              const isActive = selectedSport === sport.id;
              return (
                <button
                  key={sport.id}
                  onClick={() => setSelectedSport(sport.id as SportType | 'all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    isActive 
                      ? 'bg-white/15 text-white border border-white/20' 
                      : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? sport.color : 'text-white/40'}`} />
                  {sport.label}
                </button>
              );
            })}
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            {regions.map((region) => {
              const isActive = selectedRegion === region;
              return (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    isActive 
                      ? 'bg-white/15 text-white border border-white/20' 
                      : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {region === 'Todos' ? (isPt ? 'Todos' : 'All') : region}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spot Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white/90">
              {isPt ? `Spots filtrados (${filteredSpots.length})` : `Filtered spots (${filteredSpots.length})`}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              {selectedSport !== 'all' && `${SPORTS.find(s => s.id === selectedSport)?.label} • `}
              {selectedRegion !== 'Todos' && `${selectedRegion} • `}
              {isPt ? 'Ordenados por score' : 'Sorted by score'}
            </p>
          </div>
        </div>
        
        {filteredSpots.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/40 text-lg">
              {isPt ? 'Nenhum spot encontrado com estes filtros.' : 'No spots found with these filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSpots.map((data) => {
              const sportEntries = Object.entries(data.allScores)
                .filter(([, s]) => s.score > 0)
                .sort(([, a], [, b]) => b.score - a.score);

              const primary = sportEntries[0];
              const primarySport = primary?.[0] as SportType | null;
              const primaryScore = primary?.[1];

              return (
                <SpotCard
                  key={data.spot.id}
                  spot={data.spot}
                  locale={locale}
                  conditions={data.conditions}
                  sportScore={primaryScore}
                  selectedSport={primarySport}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
