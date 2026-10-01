'use client';

import { useEffect, useState } from 'react';
import { CloudLightning } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import {
  loadNhcStorms,
  stormsForSpot,
  stormsFresh,
  mphToKmh,
  movementCardinal,
  type NhcStormsFile,
  type NhcSpotStrike,
} from '@/lib/nhcStorms';

/**
 * Alerta NHC no spot page — só aparece quando o cone de incerteza oficial
 * cobre este spot (`spotStorms` pré-computado no pipeline). Nunca inventa
 * proximidade: sem cone a tocar, não há alerta. Fonte atribuída inline.
 */
export default function SpotStormAlert({
  spotId,
  locale,
}: {
  spotId: string;
  locale: string;
}) {
  const [file, setFile] = useState<NhcStormsFile | null>(null);
  const tc = getTranslation(locale).spotPageContext;
  const isPt = locale === 'pt';

  useEffect(() => {
    let cancelled = false;
    // Optional layer — loader partilha cache com a camada do mapa e nunca
    // quebra a página em falha de fetch.
    loadNhcStorms()
      .then((d) => {
        if (!cancelled) setFile(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!file || !stormsFresh(file)) return null;
  const strikes = stormsForSpot(file, spotId);
  if (strikes.length === 0) return null;

  const metaFor = (s: NhcSpotStrike) =>
    tc.stormConeMeta
      .replace('{cls}', s.classificationLabel ?? s.classification)
      .replace('{km}', String(Math.round(s.centerDistKm)))
      .replace('{dir}', movementCardinal(s.movementDirDeg, isPt) ?? '—')
      .replace('{kmh}', s.movementSpeedMph != null ? String(mphToKmh(s.movementSpeedMph)) : '—');

  return (
    <ul className="space-y-2 list-none p-0 m-0 mb-2" data-visual-dynamic>
      {strikes.map((s) => {
        const hurricane = s.classification === 'HU' || s.classification === 'MH';
        return (
          <li
            key={s.id ?? s.name ?? 'storm'}
            className={`rounded-card border px-3 py-2 ${
              hurricane
                ? 'bg-red-500/15 text-red-500 border-red-500/40'
                : 'bg-score-poor/15 text-score-poor border-score-poor/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <CloudLightning className="w-4 h-4 shrink-0" aria-hidden />
              <span className="font-semibold text-fg">
                {tc.stormConeTitle.replace('{name}', s.name ?? s.id ?? '—')}
              </span>
            </div>
            <p className="text-meta-sm text-fg-muted mt-1 leading-snug">{metaFor(s)}</p>
          </li>
        );
      })}
    </ul>
  );
}
