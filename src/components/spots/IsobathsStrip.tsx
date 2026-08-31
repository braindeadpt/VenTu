'use client';

import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';
import {
  loadSpotIsobaths,
  isobathDistancesForSpot,
  ISOBATH_DEPTHS,
} from '@/lib/spotIsobaths';

interface IsobathsStripProps {
  spotId: string;
  locale: string;
}

function formatKm(km: number, isPt: boolean): string {
  if (km < 1) return isPt ? `${Math.round(km * 1000)} m` : `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * «Fundo perto da praia» — real seabed depth contours (IH depcnt_8_16_30)
 * near the spot: distance from the shore point to the nearest 8/16/30 m
 * contour. E.g. Nazaré: 8 m a 0.25 km · 16 m a 0.31 km · 30 m a 0.46 km —
 * the seabed shelves fast there. Renders nothing when the spot has no
 * nearby contour (deep offshore / data gap) or the file is missing.
 */
export default function IsobathsStrip({ spotId, locale }: IsobathsStripProps) {
  const isPt = locale === 'pt';
  const [depths, setDepths] = useState<Record<number, number> | null | undefined>(undefined);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSpotIsobaths()
      .then((file) => {
        if (cancelled) return;
        setDepths(isobathDistancesForSpot(file, spotId));
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  // Ainda a carregar → nada (evita flash); sem dados → nada.
  if (!done || !depths) return null;

  const entries = ISOBATH_DEPTHS.filter((d) => typeof depths[d] === 'number');
  if (entries.length === 0) return null;

  return (
    <div
      className="rounded-card border border-divider bg-surface-1/[0.03] px-3 py-3"
      data-testid="isobaths-strip"
    >
      <p className="text-meta-sm font-semibold text-fg-muted mb-2 inline-flex items-center gap-1.5">
        <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
        {isPt ? 'Fundo perto da praia' : 'Seabed near the beach'}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 list-none p-0 m-0 text-meta-sm">
        {entries.map((depth) => (
          <li key={depth} className="inline-flex items-baseline gap-1">
            <span className="text-fg-muted">{depth} m</span>
            <span className="font-mono tabular-nums text-fg font-medium">
              {formatKm(depths[depth] as number, isPt)}
            </span>
          </li>
        ))}
      </ul>
      <p
        className="text-meta-xs text-fg-subtle mt-1.5"
        title={
          isPt
            ? 'Distância da praia à isóbata (IH depcnt_8_16_30) — onde o fundo atinge 8, 16 e 30 m. Fonte: Instituto Hidrográfico, CC-BY 4.0.'
            : 'Distance from the beach to the depth contour (IH depcnt_8_16_30) — where the seabed reaches 8, 16 and 30 m. Source: Instituto Hidrográfico, CC-BY 4.0.'
        }
      >
        {isPt
          ? 'Isóbatas IH (CC-BY 4.0) — distância da praia a cada profundidade'
          : 'IH isobaths (CC-BY 4.0) — distance from shore to each depth'}
      </p>
    </div>
  );
}
