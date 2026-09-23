'use client';

import { getSpotLivecam } from '@/lib/spotLivecams';
import SpotLivecamLink from '@/components/weather/SpotLivecamLink';
import { getTranslation } from '@/lib/i18n';

interface SpotWebcamSectionProps {
  slug: string;
  locale: string;
  /** Sem wrapper nem título — o hospedeiro (rail/accordion) fornece-os. */
  embedded?: boolean;
  /** 'row' (default — texto e botão lado a lado ≥sm) ou 'stacked'
   *  (botão em largura total por baixo, como já acontece no mobile). */
  layout?: 'row' | 'stacked';
}

/** Livecam block — only shown when a curated external source exists. */
export default function SpotWebcamSection({
  slug,
  locale,
  embedded,
  layout,
}: SpotWebcamSectionProps) {
  if (!getSpotLivecam(slug)) return null;

  const t = getTranslation(locale);

  // «stacked» força a coluna também ≥sm: o cartão interno (SpotLivecamLink)
  // é `flex-col sm:flex-row sm:items-center` e não recebe props de layout.
  // O override vive só neste wrapper — os outros usos ficam iguais.
  const card =
    layout === 'stacked' ? (
      <div
        data-layout="stacked"
        className="[&_.sm\:flex-row]:!flex-col [&_.sm\:items-center]:!items-stretch"
      >
        <SpotLivecamLink slug={slug} locale={locale} />
      </div>
    ) : (
      <SpotLivecamLink slug={slug} locale={locale} />
    );

  if (embedded) return card;

  return (
    <section className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-h2 text-fg mb-4">{t.layout.weatherLiveCamera}</h2>
      {card}
    </section>
  );
}
