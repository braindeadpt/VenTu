'use client';

import { Wind, Waves, Thermometer, Gauge } from 'lucide-react';
import WindCompass from '@/components/ui/WindCompass';
import { getWaveRating, getWindRating } from '@/lib/openmeteo';

interface ConditionCardProps {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  compact?: boolean;
}

export default function ConditionCard({
  waveHeight, wavePeriod, windSpeed, windDirection, windGust, waterTemp, compact = false,
}: ConditionCardProps) {
  const waveRating = getWaveRating(waveHeight);
  const windRating = getWindRating(windSpeed);

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Waves className="w-4 h-4 text-wave-400" />
          <span className="font-semibold">{waveHeight.toFixed(1)}m</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="w-4 h-4 text-wind-400" />
          <span className="font-semibold">{windSpeed.toFixed(0)}kt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-4 h-4 text-surf-400" />
          <span className="font-semibold">{waterTemp.toFixed(0)}°C</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-5 h-5 text-wave-400" />
          <div>
            <p className="text-xs text-white/50">Altura Onda</p>
            <p className="text-2xl font-bold">{waveHeight.toFixed(1)}<span className="text-sm font-normal text-white/60">m</span></p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${waveRating.className}`}>
          {wavePeriod.toFixed(0)}s
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WindCompass direction={windDirection} speed={windSpeed} size={48} />
          <div>
            <p className="text-xs text-white/50">Vento</p>
            <p className="text-2xl font-bold">{windSpeed.toFixed(0)}<span className="text-sm font-normal text-white/60">kt</span></p>
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${windRating.className}`}>
            Raj: {windGust.toFixed(0)}kt
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <div className="flex items-center gap-3">
          <Thermometer className="w-5 h-5 text-surf-400" />
          <div>
            <p className="text-xs text-white/50">Temp. Água</p>
            <p className="text-lg font-bold">{waterTemp.toFixed(1)}°C</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Gauge className="w-5 h-5 text-ocean-400" />
          <div>
            <p className="text-xs text-white/50">Período</p>
            <p className="text-lg font-bold">{wavePeriod.toFixed(1)}s</p>
          </div>
        </div>
      </div>
    </div>
  );
}