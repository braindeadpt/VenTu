'use client';

import { useEffect, useState } from 'react';
import { getSpotLivecam } from '@/lib/spotLivecams';
import SpotLivecamLink from '@/components/weather/SpotLivecamLink';
import WindyWebcam from '@/components/weather/WindyWebcam';

interface SpotWebcamSectionProps {
  slug: string;
  lat: number;
  lon: number;
  locale: string;
}

export default function SpotWebcamSection({ slug, lat, lon, locale }: SpotWebcamSectionProps) {
  const curated = getSpotLivecam(slug);
  const hasWindyKey = Boolean(process.env.NEXT_PUBLIC_WINDY_API_KEY);
  const [windyVisible, setWindyVisible] = useState(hasWindyKey);

  useEffect(() => {
    if (!hasWindyKey) setWindyVisible(false);
  }, [hasWindyKey]);

  if (!curated && !hasWindyKey) return null;
  if (!curated && !windyVisible) return null;

  const isPt = locale === 'pt';

  return (
    <section className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h2 className="text-h2 text-fg">{isPt ? 'Livecam' : 'Live cam'}</h2>
      {curated && <SpotLivecamLink slug={slug} locale={locale} />}
      {hasWindyKey && windyVisible && (
        <WindyWebcam
          lat={lat}
          lon={lon}
          locale={locale}
          onEmpty={() => setWindyVisible(false)}
        />
      )}
    </section>
  );
}
