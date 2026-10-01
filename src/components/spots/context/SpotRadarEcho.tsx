'use client';

import { useEffect, useState } from 'react';
import { CloudRain } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { radarFrameClock } from '@/lib/ipmaRadar';
import { movementCardinal } from '@/lib/nhcStorms';
import {
  loadStormState,
  stormStateForSpot,
  radarStateFresh,
  type StormStateFile,
} from '@/lib/stormState';

/**
 * Estado de precipitação do radar IPMA para este spot — eco mais próximo,
 * intensidade e «a aproximar-se» (deslocamento medido do centróide, não
 * previsão). Renderiza só quando há eco perto/sobre e o frame é fresco
 * (<75 min) — spot limpo ou frame velho omite-se.
 */
export default function SpotRadarEcho({
  spotId,
  locale,
}: {
  spotId: string;
  locale: string;
}) {
  const [file, setFile] = useState<StormStateFile | null>(null);
  const tc = getTranslation(locale).spotPageContext;
  const isPt = locale === 'pt';

  useEffect(() => {
    let cancelled = false;
    loadStormState()
      .then((d) => {
        if (!cancelled) setFile(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!file || !radarStateFresh(file)) return null;
  const radar = stormStateForSpot(file, spotId)?.radar;
  if (!radar || radar.state === 'clean') return null;

  const over = radar.state === 'over';
  const intensityLabel =
    radar.intensity === 'heavy'
      ? tc.stormIntensityHeavy
      : radar.intensity === 'moderate'
        ? tc.stormIntensityModerate
        : tc.stormIntensityLight;

  const title = over
    ? tc.stormRainOver
    : tc.stormRainNear
        .replace('{km}', String(radar.distKm ?? '—'))
        .replace('{dir}', movementCardinal(radar.dirDeg, isPt) ?? '—');

  const parts: string[] = [intensityLabel];
  if (radar.approach?.state === 'approaching') {
    // `deg` é para onde o eco VAI — «de onde vem» é o inverso.
    const fromDeg = radar.approach.deg != null ? (radar.approach.deg + 180) % 360 : null;
    parts.push(
      tc.stormRainApproach
        .replace('{dir}', movementCardinal(fromDeg, isPt) ?? '—')
        .replace('{kmh}', radar.approach.kmh != null ? String(radar.approach.kmh) : '—'),
    );
  } else if (radar.approach?.state === 'receding') {
    parts.push(tc.stormRainRecede);
  }
  // frameTime é wall-clock de Lisboa com "Z" falso — mostra-se tal como
  // está escrito (mesma convenção do badge do carrossel), sem shift de TZ.
  const frameClock = radarFrameClock(file.radar.frameTime);
  if (frameClock) {
    parts.push(tc.stormRadarSource.replace('{time}', frameClock));
  }

  const chipClass =
    over && radar.intensity === 'heavy'
      ? 'bg-red-500/15 text-red-500 border-red-500/40'
      : over
        ? 'bg-score-poor/15 text-score-poor border-score-poor/40'
        : 'bg-score-fair/15 text-score-fair border-score-fair/40';

  return (
    <div className={`rounded-card border px-3 py-2 mb-2 ${chipClass}`} data-visual-dynamic>
      <div className="flex items-center gap-2">
        <CloudRain className="w-4 h-4 shrink-0" aria-hidden />
        <span className="font-semibold text-fg">{title}</span>
      </div>
      <p className="text-meta-sm text-fg-muted mt-1 leading-snug">{parts.join(' · ')}</p>
    </div>
  );
}
