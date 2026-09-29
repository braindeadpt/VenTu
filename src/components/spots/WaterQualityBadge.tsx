'use client';

import { AlertTriangle, Award, Droplets, Accessibility, HelpCircle } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { waterQualityInSeason, type WaterQualityLive } from '@/lib/waterQuality';

interface WaterQualityBadgeProps {
  blueFlag?: boolean;
  waterQuality?: 'excelente' | 'boa' | 'razoavel' | 'má';
  waterQualityEn?: 'excellent' | 'good' | 'fair' | 'poor';
  accessibleBeach?: boolean;
  /** Registo APA InfoÁgua vivo (conditions.waterQuality) — conselho balnear,
   *  classe anual, alertas. Só presente em spots ≤3 km de uma água balnear. */
  live?: WaterQualityLive;
  locale: string;
}

const CHIP = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold';

export function WaterQualityBadge({
  blueFlag,
  waterQuality,
  waterQualityEn,
  accessibleBeach,
  live,
  locale,
}: WaterQualityBadgeProps) {
  const isPT = locale === 'pt';
  const t = getTranslation(locale).spotPageContext;

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

  const apaClassLabels: Record<number, string> = {
    1: t.wqClassExcellent,
    2: t.wqClassGood,
    3: t.wqClassSufficient,
    4: t.wqClassPoor,
  };
  const apaClass = live?.annualClass ? apaClassLabels[live.annualClass] : null;

  const quality = isPT ? waterQuality : waterQualityEn;
  const qualityInfo = !apaClass && quality ? qualityConfig[quality] : null;

  const inSeason = live ? waterQualityInSeason(live, Date.now()) : false;
  const showAdvice = inSeason && live && (live.advice === 1 || live.advice === 2);
  const kmFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(live?.blueFlag || (!live && blueFlag)) && (
          <div className={`${CHIP} bg-data-waves/20 text-data-waves border-data-waves/30`}>
            <Award className="w-3.5 h-3.5" />
            {live?.blueFlag ? t.wqBlueFlag : isPT ? 'Bandeira Azul 2024' : 'Blue Flag 2024'}
          </div>
        )}
        {apaClass && (
          <div className={`${CHIP} bg-data-waves/20 text-data-waves border-data-waves/30`}>
            <Droplets className="w-3.5 h-3.5" />
            {t.wqApaClass.replace('{cls}', apaClass)}
          </div>
        )}
        {qualityInfo && (
          <div className={`${CHIP} ${qualityInfo.color}`}>
            <Droplets className="w-3.5 h-3.5" />
            {isPT ? 'Qualidade da água: ' : 'Water quality: '}
            {qualityInfo.label}
          </div>
        )}
        {showAdvice && (
          <div
            className={`${CHIP} ${
              live.advice === 2
                ? 'bg-windDir-onshore/20 text-windDir-onshore border-windDir-onshore/30'
                : 'bg-windDir-offshore/20 text-windDir-offshore border-windDir-offshore/30'
            }`}
            title={live.motive ?? undefined}
            data-water-advice={live.advice}
          >
            {live.advice === 2 ? (
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            ) : (
              <Droplets className="w-3.5 h-3.5" aria-hidden />
            )}
            {live.advice === 2 ? t.wqAdviceBad : t.wqAdviceGood}
          </div>
        )}
        {inSeason && live?.advice === 0 && (
          <div
            className={`${CHIP} bg-surface-2 text-fg-muted border-divider`}
            data-water-advice="0"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden />
            {t.wqAdviceNone}
          </div>
        )}
        {live?.alerts?.map((a, i) => (
          <div
            key={i}
            className={`${CHIP} bg-score-fair/20 text-score-fair border-score-fair/30`}
            title={[isPT ? a.advicePt : a.adviceEn, a.date].filter(Boolean).join(' · ') || undefined}
            data-water-alert="true"
          >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            {isPT ? a.namePt : a.nameEn}
          </div>
        ))}
        {(accessibleBeach || live?.accessible) && (
          <div className={`${CHIP} bg-data-waves/20 text-data-waves border-data-waves/30`}>
            <Accessibility className="w-3.5 h-3.5" />
            {isPT ? 'Praia Acessível' : 'Accessible Beach'}
          </div>
        )}
      </div>
      {live && (
        <p className="text-meta-sm text-fg-muted" data-water-quality-meta="true">
          {(live.distKm != null && live.distKm > 0.5
            ? t.wqBeachLine.replace('{name}', live.beach).replace('{km}', kmFmt.format(live.distKm))
            : t.wqBeachNear.replace('{name}', live.beach))}
          {live.lastSampleAt ? ` · ${t.wqLastSample.replace('{date}', dateFmt.format(live.lastSampleAt))}` : ''}
          {` · ${t.wqSource}`}
        </p>
      )}
    </div>
  );
}
