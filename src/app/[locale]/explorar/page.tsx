import Link from 'next/link'
import { locales } from '@/lib/i18n'
import {
  SEO_LANDINGS,
  SPORT_LABELS,
  REGION_LABELS,
  landingTitle,
  type SeoLanding,
} from '@/lib/seoLandings'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const title = isPt ? 'Explorar spots por desporto e região — VenTu' : 'Explore spots by sport and region — VenTu'
  const description = isPt
    ? `${SEO_LANDINGS.length} combinações de desporto e região em Portugal — condições actualizadas a cada 3 horas.`
    : `${SEO_LANDINGS.length} sport and region combinations in Portugal — conditions updated every 3 hours.`
  return { title, description, openGraph: { title, description } }
}

function groupLandings(landings: SeoLanding[]) {
  const bySport = new Map<string, SeoLanding[]>()
  for (const landing of landings) {
    const list = bySport.get(landing.sport) ?? []
    list.push(landing)
    bySport.set(landing.sport, list)
  }
  return [...bySport.entries()].sort(([a], [b]) =>
    (SPORT_LABELS[a]?.pt ?? a).localeCompare(SPORT_LABELS[b]?.pt ?? b),
  )
}

export default async function ExplorarIndexPage({ params }: Props) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const groups = groupLandings(SEO_LANDINGS)

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-fg">
            {isPt ? 'Explorar spots' : 'Explore spots'}
          </h1>
          <p className="text-fg-muted max-w-2xl">
            {isPt
              ? `${SEO_LANDINGS.length} páginas por desporto e região — scores, previsões e condições actualizadas a cada 3 horas.`
              : `${SEO_LANDINGS.length} pages by sport and region — scores, forecasts and conditions updated every 3 hours.`}
          </p>
        </header>

        <div className="space-y-10">
          {groups.map(([sport, landings]) => {
            const sportLabel = SPORT_LABELS[sport]
            const sportOnly = landings.find((l) => !l.region)
            const regional = landings.filter((l) => l.region)

            return (
              <section key={sport}>
                <h2 className="text-xl font-semibold text-fg mb-3">
                  {isPt ? sportLabel?.pt : sportLabel?.en}
                </h2>
                <ul className="space-y-2">
                  {sportOnly && (
                    <li>
                      <Link
                        href={`/${locale}/explorar/${sportOnly.slug}/`}
                        className="text-data-waves hover:underline"
                      >
                        {landingTitle(sportOnly, locale)}
                        <span className="text-fg-subtle text-sm ml-2">
                          ({sportOnly.spotCount} spots)
                        </span>
                      </Link>
                    </li>
                  )}
                  {regional.map((landing) => (
                    <li key={landing.slug}>
                      <Link
                        href={`/${locale}/explorar/${landing.slug}/`}
                        className="text-fg-muted hover:text-data-waves transition-colors"
                      >
                        {landing.region
                          ? isPt
                            ? REGION_LABELS[landing.region].pt
                            : REGION_LABELS[landing.region].en
                          : landing.slug}
                        <span className="text-fg-subtle text-sm ml-2">
                          ({landing.spotCount})
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
