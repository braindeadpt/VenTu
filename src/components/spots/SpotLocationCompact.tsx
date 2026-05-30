'use client';

import { ExternalLink, MapPin } from 'lucide-react';
import SpotMap from '@/components/spots/SpotMap';

interface SpotLocationCompactProps {
  lat: number;
  lon: number;
  locale: string;
  title: string;
  directionsHref: string;
  directionsLabel: string;
  openMapsLabel: string;
}

/** Secondary map block — compact, not above the fold. */
export default function SpotLocationCompact({
  lat,
  lon,
  locale,
  title,
  directionsHref,
  directionsLabel,
  openMapsLabel,
}: SpotLocationCompactProps) {
  const isPt = locale === 'pt';

  return (
    <aside
      className="rounded-card border border-divider bg-surface-1/[0.03] p-3 flex flex-col sm:flex-row gap-3 sm:items-stretch"
      aria-label={title}
    >
      <div className="h-28 w-full sm:w-44 shrink-0">
        <SpotMap lat={lat} lon={lon} locale={locale} compact />
      </div>
      <div className="flex flex-col justify-center gap-2 min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-fg-muted shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 className="text-meta font-semibold text-fg">{title}</h3>
            <p className="text-meta-sm text-fg-muted font-mono tabular-nums mt-0.5">
              {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-input border border-divider bg-bg-elevated px-3 py-2 text-meta-sm font-medium text-fg hover:border-divider-strong transition-colors min-h-[44px]"
          >
            {directionsLabel}
          </a>
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-meta-sm text-data-waves hover:text-data-waves/80 font-medium min-h-[44px] px-1"
          >
            {openMapsLabel}
            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
          </a>
        </div>
        <p className="text-meta-sm text-fg-subtle hidden sm:block">
          {isPt
            ? 'Mapa de referência — condições na secção Agora acima.'
            : 'Reference map — conditions are in the Now section above.'}
        </p>
      </div>
    </aside>
  );
}
