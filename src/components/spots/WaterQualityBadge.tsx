'use client';

import { Award, Droplets, Accessibility } from 'lucide-react';

interface WaterQualityBadgeProps {
  blueFlag?: boolean;
  waterQuality?: 'excelente' | 'boa' | 'razoavel' | 'má';
  waterQualityEn?: 'excellent' | 'good' | 'fair' | 'poor';
  accessibleBeach?: boolean;
  locale: string;
}

export function WaterQualityBadge({
  blueFlag,
  waterQuality,
  waterQualityEn,
  accessibleBeach,
  locale,
}: WaterQualityBadgeProps) {
  const isPT = locale === 'pt';

  const qualityConfig = {
    excelente: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Excelente' },
    boa: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Boa' },
    razoavel: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Razoável' },
    má: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Má' },
    excellent: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Excellent' },
    good: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Good' },
    fair: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Fair' },
    poor: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Poor' },
  };

  const quality = isPT ? waterQuality : waterQualityEn;
  const qualityInfo = quality ? qualityConfig[quality] : null;

  return (
    <div className="flex flex-wrap gap-2">
      {blueFlag && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold">
          <Award className="w-3.5 h-3.5" />
          {isPT ? 'Bandeira Azul 2024' : 'Blue Flag 2024'}
        </div>
      )}
      {qualityInfo && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${qualityInfo.color}`}>
          <Droplets className="w-3.5 h-3.5" />
          {isPT ? 'Qualidade da água: ' : 'Water quality: '}
          {qualityInfo.label}
        </div>
      )}
      {accessibleBeach && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold">
          <Accessibility className="w-3.5 h-3.5" />
          {isPT ? 'Praia Acessível' : 'Accessible Beach'}
        </div>
      )}
    </div>
  );
}
