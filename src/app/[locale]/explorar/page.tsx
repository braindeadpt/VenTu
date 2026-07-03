import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { locales } from '@/lib/i18n';
import {
  SEO_LANDINGS,
  SPORT_LABELS,
  REGION_LABELS,
  landingTitle,
  type SeoLanding,
} from '@/lib/seoLandings';
import { buildPageMetadata } from '@/lib/seo';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import PageHeader from '@/components/ui/PageHeader';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ locale: string }>;
}

const SPORT_ACCENT: Record<string, string> = {
  surf: 'border-l-sport-surf',
  kitesurf: 'border-l-sport-kitesurf',
  windsurf: 'border-l-sport-windsurf',
  bodyboard: 'border-l-sport-bodyboard',
  sup: 'border-l-sport-sup',
  foil: 'border-l-sport-foil',
  wakeboard: 'border-l-sport-wakeboard',
  'big-wave': 'border-l-windDir-offshore',
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const loc = isPt ? 'pt' : 'en';
  const title = isPt ? 'Explorar spots por desporto e região — VenTu' : 'Explore spots by sport and region — VenTu';
  const description = isPt
    ? `${SEO_LANDINGS.length} combinações de desporto e região em Portugal — condições ${pipelineSchedule('pt')}.`
    : `${SEO_LANDINGS.length} sport and region combinations in Portugal — conditions ${pipelineSchedule('en')}.`;
  return buildPageMetadata({ title, description, locale: loc, path: `/${loc}/explorar/` });
}

function groupLandings(landings: SeoLanding[]) {
  const bySport = new Map<string, SeoLanding[]>();
  for (const landing of landings) {
    const list = bySport.get(landing.sport) ?? [];
    list.push(landing);
    bySport.set(landing.sport, list);
  }
  return [...bySport.entries()].sort(([a], [b]) =>
    (SPORT_LABELS[a]?.pt ?? a).localeCompare(SPORT_LABELS[b]?.pt ?? b),
  );
}

export default async function ExplorarIndexPage({ params }: Props) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const groups = groupLandings(SEO_LANDINGS);

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <PageHeader
          title={isPt ? 'Explorar spots' : 'Explore spots'}
          subtitle={
            isPt
              ? `${SEO_LANDINGS.length} páginas por desporto e região — scores, previsões e condições ${pipelineSchedule('pt')}.`
              : `${SEO_LANDINGS.length} pages by sport and region — scores, forecasts and conditions ${pipelineSchedule('en')}.`
          }
        />

        <div className="space-y-12">
          {groups.map(([sport, landings]) => {
            const sportLabel = SPORT_LABELS[sport];
            const sportOnly = landings.find((l) => !l.region);
            const regional = landings.filter((l) => l.region);
            const accent = SPORT_ACCENT[sport] ?? 'border-l-data-waves';

            return (
              <section key={sport}>
                <h2 className="sport-accent text-h3 mb-4" data-sport={sport}>
                  {isPt ? sportLabel?.pt : sportLabel?.en}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sportOnly && (
                    <Link
                      href={`/${locale}/explorar/${sportOnly.slug}/`}
                      className={`card-1 p-4 border-l-4 ${accent} hover:bg-surface-2/[0.04] transition-colors group`}
                    >
                      <p className="text-body font-medium text-fg group-hover:text-data-waves transition-colors">
                        {landingTitle(sportOnly, locale)}
                      </p>
                      <p className="text-meta text-fg-subtle mt-1">
                        {sportOnly.spotCount} spots
                      </p>
                    </Link>
                  )}

                  {regional.map((landing) => (
                    <Link
                      key={landing.slug}
                      href={`/${locale}/explorar/${landing.slug}/`}
                      className={`card-1 p-4 border-l-4 ${accent} hover:bg-surface-2/[0.04] transition-colors group`}
                    >
                      <p className="text-body font-medium text-fg group-hover:text-data-waves transition-colors flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-fg-subtle shrink-0" aria-hidden />
                        {landing.region
                          ? isPt
                            ? REGION_LABELS[landing.region].pt
                            : REGION_LABELS[landing.region].en
                          : landing.slug}
                      </p>
                      <p className="text-meta text-fg-subtle mt-1">
                        {landing.spotCount} spots
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
