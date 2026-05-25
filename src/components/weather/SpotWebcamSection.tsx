'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getSpotLivecam } from '@/lib/spotLivecams';
import { hasWindyWebcam } from '@/lib/windyWebcams';
import SpotLivecamLink from '@/components/weather/SpotLivecamLink';
import WindyWebcam from '@/components/weather/WindyWebcam';

interface SpotWebcamSectionProps {
  slug: string;
  locale: string;
}

export default function SpotWebcamSection({ slug, locale }: SpotWebcamSectionProps) {
  const curated = getSpotLivecam(slug);
  const hasWindy = hasWindyWebcam(slug);
  const [windyVisible, setWindyVisible] = useState(hasWindy);

  if (!curated && !windyVisible) return null;

  const isPt = locale === 'pt';

  return (
    <section className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-h2 text-fg mb-4">{isPt ? 'Livecam' : 'Live cam'}</h2>

      {hasWindy && windyVisible && !curated?.embedUrl ? (
        <div className="space-y-3">
          <WindyWebcam slug={slug} onEmpty={() => setWindyVisible(false)} />
          {curated && (
            <p className="text-sm text-fg-muted">
              {isPt ? 'Fonte alternativa' : 'Alternative source'}:{' '}
              <a
                href={curated.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-data-waves hover:underline"
              >
                {isPt ? curated.labelPt : curated.labelEn} ({curated.provider})
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
            </p>
          )}
        </div>
      ) : (
        curated && <SpotLivecamLink slug={slug} locale={locale} />
      )}
    </section>
  );
}
