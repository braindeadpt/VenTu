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
  locale?: string;
}

export default function ConditionCard({
  waveHeight, wavePeriod, windSpeed, windDirection, windGust, waterTemp, compact = false, locale = 'pt',
}: ConditionCardProps) {
  const waveRating = getWaveRating(waveHeight);
  const windRating = getWindRating(windSpeed);
  const isPt = locale === 'pt';

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Waves className="w-4 h-4 text-data-waves" />
          <span className="font-semibold">{waveHeight.toFixed(1)}m</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="w-4 h-4 text-data-wind" />
          <span className="font-semibold">{(windSpeed * 1.94384).toFixed(0)}kt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-4 h-4 text-data-waves" />
          <span className="font-semibold">{waterTemp.toFixed(0)}°C</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-5 h-5 text-data-waves" />
          <div>
            <p className="text-xs text-fg-muted">{isPt ? 'Altura Onda' : 'Wave Height'}</p>
            <p className="text-2xl font-bold">{waveHeight.toFixed(1)}<span className="text-sm font-normal text-fg-subtle">m</span></p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${waveRating.className}`}>
          {wavePeriod.toFixed(0)}s
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WindCompass direction={windDirection} speed={windSpeed * 1.94384} size={48} />
          <div>
            <p className="text-xs text-fg-muted">{isPt ? 'Vento' : 'Wind'}</p>
            <p className="text-2xl font-bold">{(windSpeed * 1.94384).toFixed(0)}<span className="text-sm font-normal text-fg-subtle">kt</span></p>
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${windRating.className}`}>
            {isPt ? 'Raj' : 'Gust'}: {(windGust * 1.94384).toFixed(0)}kt
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-divider">
        <div className="flex items-center gap-3">
          <Thermometer className="w-5 h-5 text-data-waves" />
          <div>
            <p className="text-xs text-fg-muted">{isPt ? 'Temp. Água' : 'Water Temp'}</p>
            <p className="text-lg font-bold">{waterTemp.toFixed(1)}°C</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Gauge className="w-5 h-5 text-data-waves" />
          <div>
            <p className="text-xs text-fg-muted">{isPt ? 'Período' : 'Period'}</p>
            <p className="text-lg font-bold">{wavePeriod.toFixed(1)}s</p>
          </div>
        </div>
      </div>
    </div>
  );
}
