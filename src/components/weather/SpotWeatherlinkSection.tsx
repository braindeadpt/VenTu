'use client';

import { ExternalLink, Gauge } from 'lucide-react';
import {
  getSpotWeatherlink,
  getWeatherlinkEmbedUrl,
  getWeatherlinkPageUrl,
} from '@/lib/spotWeatherlink';

interface SpotWeatherlinkSectionProps {
  slug: string;
  locale: string;
}

/** Davis WeatherLink embed — local anemometer at the spot (complements Open-Meteo). */
export default function SpotWeatherlinkSection({ slug, locale }: SpotWeatherlinkSectionProps) {
  const station = getSpotWeatherlink(slug);
  if (!station) return null;

  const isPt = locale === 'pt';
  const title = isPt ? station.labelPt : station.labelEn;
  const embedUrl = getWeatherlinkEmbedUrl(station.pageId);
  const pageUrl = getWeatherlinkPageUrl(station.pageId);

  return (
    <section className="max-w-6xl mx-auto px-4 py-6" aria-labelledby="weatherlink-heading">
      <h2 id="weatherlink-heading" className="text-h2 text-fg mb-1">
        {isPt ? 'Estação na praia' : 'Beach weather station'}
      </h2>
      <p className="text-meta text-fg-muted mb-4 max-w-2xl">
        {isPt
          ? 'Sensor Davis na praia (vento, temperatura, humidade). Complementa a previsão Open-Meteo — não altera o score VenTu.'
          : 'Davis sensor on the beach (wind, temperature, humidity). Complements Open-Meteo — does not change the VenTu score.'}
      </p>

      <div className="card-1 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="rounded-card bg-data-wind/10 p-2.5 text-data-wind shrink-0">
              <Gauge className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-h3 text-fg">{title}</p>
              <p className="text-meta-sm text-fg-muted mt-0.5">WeatherLink · Davis Vantage Vue</p>
            </div>
          </div>
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold bg-surface-2/[0.08] text-fg border border-divider hover:border-divider-strong transition-colors min-h-[44px] shrink-0"
          >
            {isPt ? 'Abrir no WeatherLink' : 'Open on WeatherLink'}
            <ExternalLink className="w-4 h-4" aria-hidden />
          </a>
        </div>

        <div className="w-full min-h-[320px] sm:min-h-[380px] rounded-lg overflow-hidden border border-divider bg-surface-1/[0.04]">
          <iframe
            src={embedUrl}
            title={
              isPt
                ? `Condições em tempo real — ${title}`
                : `Live conditions — ${title}`
            }
            className="w-full h-[min(72vh,520px)] min-h-[320px]"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </section>
  );
}
