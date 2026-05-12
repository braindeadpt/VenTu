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
    excelente: { color: 'bg-windDir-offshore/20 text-windDir-offshore border-windDir-offshore/30', label: 'Excelente' },
    boa: { color: 'bg-data-waves/20 text-data-waves border-data-waves/30', label: 'Boa' },
    razoavel: { color: 'bg-score-fair/20 text-score-fair border-score-fair/30', label: 'Razoável' },
    má: { color: 'bg-windDir-onshore/20 text-windDir-onshore border-windDir-onshore/30', label: 'Má' },
    excellent: { color: 'bg-windDir-offshore/20 text-windDir-offshore border-windDir-offshore/30', label: 'Excellent' },
    good: { color: 'bg-data-waves/20 text-data-waves border-data-waves/30', label: 'Good' },
    fair: { color: 'bg-score-fair/20 text-score-fair border-score-fair/30', label: 'Fair' },
    poor: { color: 'bg-windDir-onshore/20 text-windDir-onshore border-windDir-onshore/30', label: 'Poor' },
  };

  const quality = isPT ? waterQuality : waterQualityEn;
  const qualityInfo = quality ? qualityConfig[quality] : null;

  return (
    <div className="flex flex-wrap gap-2">
      {blueFlag && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-data-waves/20 text-data-waves border border-data-waves/30 text-xs font-bold">
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
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-data-waves/20 text-data-waves border border-data-waves/30 text-xs font-bold">
          <Accessibility className="w-3.5 h-3.5" />
          {isPT ? 'Praia Acessível' : 'Accessible Beach'}
        </div>
      )}
    </div>
  );
}
