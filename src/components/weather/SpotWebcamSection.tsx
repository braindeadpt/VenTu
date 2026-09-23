'use client';

import { getSpotLivecam } from '@/lib/spotLivecams';
import SpotLivecamLink from '@/components/weather/SpotLivecamLink';
import { getTranslation } from '@/lib/i18n';

interface SpotWebcamSectionProps {
  slug: string;
  locale: string;
  /** Sem wrapper nem título — o hospedeiro (rail/accordion) fornece-os. */
  embedded?: boolean;
}

/** Livecam block — only shown when a curated external source exists. */
export default function SpotWebcamSection({ slug, locale, embedded }: SpotWebcamSectionProps) {
  if (!getSpotLivecam(slug)) return null;

  const t = getTranslation(locale);

  if (embedded) return <SpotLivecamLink slug={slug} locale={locale} />;

  return (
    <section className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-h2 text-fg mb-4">{t.layout.weatherLiveCamera}</h2>
      <SpotLivecamLink slug={slug} locale={locale} />
    </section>
  );
}
