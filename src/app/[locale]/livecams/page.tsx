import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { localizedText } from '@/lib/localizedText';
import { Video } from 'lucide-react';
import { locales, getTranslation, validateLocale } from '@/lib/i18n';
import { listAllLivecams, getLivecamSpotCount } from '@/lib/spotLivecams';
import { spots } from '@/lib/spots';
import { buildPageMetadata } from '@/lib/seo';
import PageHeader from '@/components/ui/PageHeader';
import LivecamsClient, { type LivecamItem } from '@/components/livecams/LivecamsClient';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const loc = validateLocale(locale);
  const count = getLivecamSpotCount();
  const title = getTranslation(locale).pages.livecamsMetaTitle.replace('{count}', String(count))
  const description = getTranslation(locale).pages.livecamsMetaDescription.replace(
    '{count}',
    String(count),
  );
  return buildPageMetadata({ title, description, locale: loc, path: `/${loc}/livecams/` });
}

export default async function LivecamsPage({ params }: Props) {
  const { locale } = await params;
  const t = getTranslation(locale as 'pt' | 'en');
  const livecams = listAllLivecams();

  const items: LivecamItem[] = livecams.map(({ slug, cam }) => {
    const spot = spots.find(s => s.slug === slug);
    return {
      slug,
      name: spot ? localizedSpotName(spot, locale) : localizedText({ pt: cam.labelPt, en: cam.labelEn }, locale),
      region: spot ? localizedSpotRegion(spot, locale) : null,
      regionKey: spot ? spot.region : null,
      provider: cam.provider,
      url: cam.url,
      embedded: cam.kind === 'youtube' || cam.kind === 'surfline',
      hasSpot: !!spot,
    };
  });

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <PageHeader
          icon={<Video className="w-12 h-12 text-data-waves" aria-hidden />}
          title={t.livecams.title}
          subtitle={t.livecams.subtitle}
        />
        <LivecamsClient locale={locale} items={items} t={t.livecams} />
      </div>
    </div>
  );
}
