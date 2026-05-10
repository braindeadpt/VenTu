'use client';

import Link from 'next/link';
import { MapPin, Wind, Waves, Star, Thermometer } from 'lucide-react';
import { Spot } from '@/types';
import { getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import FavoriteButton from '@/components/FavoriteButton';

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
    source?: 'real' | 'mock';
  };
  sportScore?: {
    score: number;
    rating: string;
    ratingEn: string;
    factors: string[];
    primaryFactor: string;
  };
  selectedSport?: SportType | null;
}

export default function SpotCard({ spot, locale, conditions, sportScore, selectedSport }: SpotCardProps) {
  const isPt = locale === 'pt';
  const colors = sportScore ? getScoreColor(sportScore.score) : { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', glow: 'shadow-slate-500/20' };

  return (
    <Link 
      href={selectedSport ? `/${locale}/spots/${spot.slug}/?sport=${selectedSport}` : `/${locale}/spots/${spot.slug}/`}
      className="block"
    >
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/5 group cursor-pointer">
        {/* Header */}
        <div className="relative h-40 bg-gradient-to-br from-slate-700 to-slate-800 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
          
          {/* Score badge */}
          {sportScore && (
            <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
              {sportScore.score}
            </div>
          )}
          
          {/* Mock data badge */}
          {conditions?.source === 'mock' && (
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              DEMO
            </div>
          )}

          {/* Name overlay */}
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-lg font-bold text-white">{spot.name}</h3>
            <div className="flex items-center gap-1 text-sm text-white/60">
              <MapPin className="w-3 h-3" />
              {spot.region}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* 3 Key Stats */}
          {conditions && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-white/60">
                <Waves className="w-4 h-4 text-cyan-400" />
                {conditions.waveHeight.toFixed(1)}m
              </span>
              <span className="flex items-center gap-1.5 text-white/60">
                <Wind className="w-4 h-4 text-sky-400" />
                {(conditions.windSpeed * 1.94384).toFixed(0)}kt
              </span>
              <span className="flex items-center gap-1.5 text-white/60">
                <Thermometer className="w-4 h-4 text-emerald-400" />
                {conditions.waterTemp.toFixed(0)}°C
              </span>
            </div>
          )}

          {/* Sport Rating */}
          {sportScore && (
            <div className="space-y-1">
              <p className={`text-sm font-medium ${colors.text}`}>
                {isPt ? sportScore.rating : sportScore.ratingEn}
              </p>
              <p className="text-xs text-white/40">
                {sportScore.factors.join(' • ')}
              </p>
            </div>
          )}

          {/* Primary factor */}
          {sportScore && (
            <div className="text-xs text-white/30 pt-1 border-t border-white/5">
              {sportScore.primaryFactor}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
