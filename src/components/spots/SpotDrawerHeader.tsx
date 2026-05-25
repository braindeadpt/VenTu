'use client';

import ScoreGauge from '@/components/ui/ScoreGauge';
import { Waves, Wind, Thermometer, Zap } from 'lucide-react';

interface SpotDrawerHeaderProps {
  name: string;
  region: string;
  score: number;
  waveHeight: string;
  windKnots: string;
  wavePowerKw: string;
  waterTemp: string | number;
  locale: string;
}

export default function SpotDrawerHeader({
  name,
  region,
  score,
  waveHeight,
  windKnots,
  wavePowerKw,
  waterTemp,
  locale,
}: SpotDrawerHeaderProps) {
  const isPt = locale === 'pt';

  return (
    <div className="flex items-start gap-4 pb-4 border-b border-divider">
      <ScoreGauge score={score} size="sm" />
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold text-fg truncate">{name}</h3>
        <p className="text-xs text-fg-muted">{region}</p>

        <div className="flex items-center gap-3 mt-2 text-xs text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Waves className="w-3 h-3" />
            {waveHeight}m
          </span>
          <span className="inline-flex items-center gap-1">
            <Wind className="w-3 h-3" />
            {windKnots}kt
          </span>
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {wavePowerKw} kW/m
          </span>
          <span className="inline-flex items-center gap-1">
            <Thermometer className="w-3 h-3" />
            {waterTemp}°C
          </span>
        </div>

        <p className="text-[10px] text-fg-subtle/60 mt-1">
          {isPt ? 'Score para desporto selecionado' : 'Score for selected sport'}
        </p>
      </div>
    </div>
  );
}
