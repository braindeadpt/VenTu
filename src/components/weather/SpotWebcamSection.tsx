'use client';

import { useState } from 'react';
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
    <section className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h2 className="text-h2 text-fg">{isPt ? 'Livecam' : 'Live cam'}</h2>
      {curated && <SpotLivecamLink slug={slug} locale={locale} />}
      {hasWindy && windyVisible && (
        <WindyWebcam slug={slug} onEmpty={() => setWindyVisible(false)} />
      )}
    </section>
  );
}
