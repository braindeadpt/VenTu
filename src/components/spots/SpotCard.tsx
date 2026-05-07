'use client';

import Link from 'next/link';
import { MapPin, Wind, Waves, Star } from 'lucide-react';
import { Spot } from '@/types';
import ConditionCard from '@/components/weather/ConditionCard';

interface SpotCardProps {
  spot: Spot;
  locale: string;
  conditions?: {
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
}

export default function SpotCard({ spot, locale, conditions }: SpotCardProps) {
  const typeColors: Record<string, string> = {
    surf: 'bg-wave-500/20 text-wave-300 border-wave-500/30',
    kitesurf: 'bg-wind-500/20 text-wind-300 border-wind-500/30',
    windsurf: 'bg-ocean-500/20 text-ocean-300 border-ocean-500/30',
    'big-wave': 'bg-red-500/20 text-red-300 border-red-500/30',
    foil: 'bg-surf-500/20 text-surf-300 border-surf-500/30',
    multisport: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  };

  const difficultyColors: Record<string, string> = {
    beginner: 'text-surf-400',
    intermediate: 'text-wave-400',
    advanced: 'text-wind-400',
    expert: 'text-red-400',
  };

  return (
    <Link href={`/${locale}/spots/${spot.slug}/`}>
      <div className="glass-card overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer group">
        <div className="relative h-48 bg-gradient-to-br from-ocean-800 to-ocean-950 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <Waves className="w-16 h-16 text-white/20 group-hover:text-white/30 transition-colors" />
          </div>
          <div className="absolute top-3 left-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${typeColors[spot.type]}`}>
              {spot.type === 'big-wave' ? 'Big Wave' : spot.type.charAt(0).toUpperCase() + spot.type.slice(1)}
            </span>
          </div>
          <div className="absolute top-3 right-3">
            <span className={`flex items-center gap-1 text-xs font-medium ${difficultyColors[spot.difficulty]}`}>
              <Star className="w-3 h-3" />
              {spot.difficulty}
            </span>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-xl font-bold text-white drop-shadow-lg">{spot.name}</h3>
            <div className="flex items-center gap-1 text-white/70 text-sm">
              <MapPin className="w-3 h-3" />
              {spot.region}
            </div>
          </div>
        </div>

        <div className="p-4">
          {conditions ? (
            <ConditionCard {...conditions} compact />
          ) : (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Wind className="w-4 h-4 animate-pulse" />
              A carregar condições...
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
            <span>Vento ideal: {spot.bestWind}</span>
            <span>•</span>
            <span>Swell ideal: {spot.bestSwell}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}