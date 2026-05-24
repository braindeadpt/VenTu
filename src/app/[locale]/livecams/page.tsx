import Link from 'next/link';
import { ExternalLink, Video } from 'lucide-react';
import { locales, getTranslation } from '@/lib/i18n';
import { listAllLivecams, getLivecamSpotCount } from '@/lib/spotLivecams';
import { spots } from '@/lib/spots';
import PageHeader from '@/components/ui/PageHeader';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const count = getLivecamSpotCount();
  const title = isPt ? `Livecams — ${count} spots — VenTu` : `Live cams — ${count} spots — VenTu`;
  const description = isPt
    ? `${count} livecams nos spots mais populares de Portugal — Surftotal, MEO Beachcam e mais.`
    : `${count} live cameras at Portugal's most popular spots — Surftotal, MEO Beachcam and more.`;
  return { title, description, openGraph: { title, description } };
}

export default async function LivecamsPage({ params }: Props) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const livecams = listAllLivecams();

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <PageHeader
          icon={<Video className="w-12 h-12 text-data-waves" aria-hidden />}
          title={t.livecams.title}
          subtitle={t.livecams.subtitle}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {livecams.map(({ slug, cam }) => {
            const spot = spots.find(s => s.slug === slug);
            const name = spot ? (isPt ? spot.name : spot.nameEn) : (isPt ? cam.labelPt : cam.labelEn);
            const region = spot ? (isPt ? spot.region : spot.regionEn) : null;

            return (
              <article
                key={slug}
                className="card-1 p-4 flex flex-col gap-3 hover:bg-surface-2/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-card bg-data-waves/10 p-2 text-data-waves shrink-0">
                    <Video className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-h3 text-fg truncate">{name}</h2>
                    {region && (
                      <p className="text-meta text-fg-subtle truncate">{region}</p>
                    )}
                    <p className="text-meta-sm text-fg-muted mt-1">
                      {t.livecams.provider}: {cam.provider}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  <a
                    href={cam.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-data-waves text-bg-base hover:bg-data-waves/80 transition-colors min-h-[36px]"
                  >
                    {t.livecams.watchLive}
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  </a>
                  {spot && (
                    <Link
                      href={`/${locale}/spots/${slug}/`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-2 text-fg border border-divider hover:bg-surface-3 transition-colors min-h-[36px]"
                    >
                      {t.livecams.viewSpot}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
