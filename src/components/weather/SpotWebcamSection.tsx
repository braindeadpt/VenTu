'use client';

import { getSpotLivecam } from '@/lib/spotLivecams';
import SpotLivecamLink from '@/components/weather/SpotLivecamLink';

interface SpotWebcamSectionProps {
  slug: string;
  locale: string;
}

/** Livecam block — only shown when a curated external source exists. */
export default function SpotWebcamSection({ slug, locale }: SpotWebcamSectionProps) {
  if (!getSpotLivecam(slug)) return null;

  const isPt = locale === 'pt';

  return (
    <section className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-h2 text-fg mb-4">{isPt ? 'Câmara ao vivo' : 'Live camera'}</h2>
      <SpotLivecamLink slug={slug} locale={locale} />
    </section>
  );
}
