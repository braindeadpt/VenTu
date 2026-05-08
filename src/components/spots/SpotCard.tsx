'use client';

import Link from 'next/link';
import { MapPin, Wind, Waves, Star, Thermometer } from 'lucide-react';
import { Spot } from '@/types';
import { getSportRating } from '@/lib/openmeteo';

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

  const typeLabels: Record<string, { pt: string; en: string }> = {
    surf: { pt: 'Surf', en: 'Surf' },
    kitesurf: { pt: 'Kitesurf', en: 'Kitesurf' },
    windsurf: { pt: 'Windsurf', en: 'Windsurf' },
    'big-wave': { pt: 'Big Wave', en: 'Big Wave' },
    foil: { pt: 'Foil', en: 'Foil' },
    multisport: { pt: 'Multidesporto', en: 'Multisport' },
  };

  const difficultyLabels: Record<string, { pt: string; en: string }> = {
    beginner: { pt: 'Iniciante', en: 'Beginner' },
    intermediate: { pt: 'Intermédio', en: 'Intermediate' },
    advanced: { pt: 'Avançado', en: 'Advanced' },
    expert: { pt: 'Especialista', en: 'Expert' },
  };

  const isPt = locale === 'pt';

  // Calculate sport-specific rating
  let rating = { rating: 5, recommendation: 'Condições razoáveis', recommendationEn: 'Fair conditions' };
  if (conditions) {
    rating = getSportRating(spot.type, conditions.waveHeight, conditions.windSpeed, conditions.wavePeriod, conditions.windDirection);
  }

  const typeLabel = typeLabels[spot.type] || { pt: spot.type, en: spot.type };
  const diffLabel = difficultyLabels[spot.difficulty] || { pt: spot.difficulty, en: spot.difficulty };

  return (
    <Link href={`/${locale}/spots/${spot.slug}/`}>
      <div className="glass-card overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer group">
        {/* Header with spot info */}
        <div className="relative h-32 bg-gradient-to-br from-ocean-800 to-ocean-950 overflow-hidden">
          <div className="absolute top-3 left-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${typeColors[spot.type]}`}>
              {isPt ? typeLabel.pt : typeLabel.en}
            </span>
          </div>
          <div className="absolute top-3 right-3">
            <span className={`flex items-center gap-1 text-xs font-medium ${difficultyColors[spot.difficulty]}`}>
              <Star className="w-3 h-3" />
              {isPt ? diffLabel.pt : diffLabel.en}
            </span>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-xl font-bold text-white drop-shadow-lg">{spot.name}</h3>
            <div className="flex items-center gap-1 text-white/70 text-sm">
              <MapPin className="w-3 h-3" />
              {spot.region}
            </div>
          </div>
          {/* Rating badge */}
          <div className="absolute bottom-3 right-3">
            <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
              rating.rating >= 7 ? 'bg-green-500/30 text-green-300' :
              rating.rating >= 4 ? 'bg-yellow-500/30 text-yellow-300' :
              'bg-red-500/30 text-red-300'
            }`}>
              {rating.rating}/10
            </div>
          </div>
        </div>

        {/* Conditions section - THE FOCUS */}
        <div className="p-4">
          {conditions ? (
            <div className="space-y-3">
              {/* Wave height */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Waves className="w-4 h-4 text-wave-400" />
                  <span className="text-sm text-white/60">{isPt ? 'Ondas' : 'Waves'}</span>
                </div>
                <span className="font-semibold text-white">{conditions.waveHeight.toFixed(1)}m</span>
              </div>
              
              {/* Wind */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-wind-400" />
                  <span className="text-sm text-white/60">{isPt ? 'Vento' : 'Wind'}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-white">{conditions.windSpeed.toFixed(0)}kt</span>
                  <span className="text-xs text-white/40 ml-1">({conditions.windGust.toFixed(0)}kt)</span>
                </div>
              </div>
              
              {/* Water temp */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-surf-400" />
                  <span className="text-sm text-white/60">{isPt ? 'Água' : 'Water'}</span>
                </div>
                <span className="font-semibold text-white">{conditions.waterTemp.toFixed(0)}°C</span>
              </div>
              
              {/* Recommendation */}
              <div className="pt-2 border-t border-white/10">
                <p className="text-sm font-medium text-white/80">{locale === 'pt' ? rating.recommendation : rating.recommendationEn}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Wind className="w-4 h-4 animate-pulse" />
              {isPt ? 'A carregar condições...' : 'Loading conditions...'}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
            <span>{isPt ? 'Vento ideal' : 'Ideal wind'}: {spot.bestWind}</span>
            <span>•</span>
            <span>{isPt ? 'Swell ideal' : 'Ideal swell'}: {spot.bestSwell}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}