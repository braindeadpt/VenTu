import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText'
import { type ComponentProps } from 'react'
import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import { locales, validateLocale } from '@/lib/i18n'
import { buildSpotMetadata } from '@/lib/seo'
import { loadEvents } from '@/lib/load-events'
import { loadSpotData } from '@/lib/load-spot-data'
import SpotDetailClient from '@/components/spots/SpotDetailClient'
import type { Metadata } from 'next'

type InitialData = NonNullable<ComponentProps<typeof SpotDetailClient>['initialData']>

// Body copy for es/de/fr falls through to EN (shell/hreflang MVP — see [locale]/layout.tsx).
export async function generateStaticParams() {
  return spots.flatMap((spot) =>
    locales.map((locale) => ({ locale, slug: spot.slug })),
  )
}

// D10 — params exaustivos: slug sem spot → 404 (produção: 404.html; dev: 404
// após o padrão aquecer — E443 a frio é upstream next.js#56253, dev-only).
export const dynamicParams = false

// FIX SEO2: Dynamic metadata per spot
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    return { title: 'Spot Not Found — VenTu' }
  }

  const isPt = locale === 'pt'
  const spotName = localizedSpotName(spot, locale)
  const regionName = localizedSpotRegion(spot, locale)

  return buildSpotMetadata(validateLocale(locale), slug, spotName, regionName)
}

export default async function SpotDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    notFound()
  }

  const events = await loadEvents()

  // Bake the spot data into the static HTML so the client renders the same
  // content it would have fetched — the old client-only load showed a skeleton
  // first, then swapped in the real page after hydration + fetch (CLS 0.44).
  // Static export data is immutable per build, so the baked snapshot is the
  // same data the client fetch would serve.
  // Build-time clock: the freshness gates (isObservedWaveFresh /
  // isObservedFresh) are evaluated at SSG with Date.now() = build time.
  // Thread the reference down so the client reproduces the exact baked
  // verdict on first paint; after mount SpotDetailClient switches to the
  // live clock (React #418 guard — see SpotDetailClient).
  const bakedAtMs = Date.now()

  const baked = loadSpotData().find((d) => d.spot.id === spot.id) ?? null
  const initialData: InitialData | null = baked
    ? {
        spot: baked.spot,
        conditions: baked.conditions,
        allScores: baked.allScores,
        // Rows are pipeline-guaranteed numeric; the client fetch path casts the
        // same arrays without normalizing.
        forecast: baked.forecast as InitialData['forecast'],
      }
    : null

  // SEM <Suspense> de propósito. O `fallback={null}` embrulhava a página toda
  // numa fronteira que o Next resolvia por SCRIPT: no HTML exportado o <main>
  // ficava vazio (<template id="B:1">) e o conteúdo só aparecia depois do
  // chunk de voo correr — com o <footer> logo a seguir a </main>, o rodapé era
  // o PRIMEIRO conteúdo pintado no lugar do herói, e só descia ~4700 px quando
  // a fronteira resolvia. Medido a 390 px: 0,7133 de CLS num único entry
  // (`footer` prev 390×602 em y=64 → cur 0×0), 84 % do total da página.
  // Nada dentro da árvore usa useSearchParams (o deep link ?sport= é lido no
  // cliente, ver SpotDetailClient) — a fronteira era herança dessa altura.
  // Sem ela, a fronteira que resta é a do segmento (`spots/loading.tsx`), cujo
  // esqueleto tem `min-h-screen`: reserva a altura da viewport desde o primeiro
  // paint e o rodapé fica abaixo da dobra. Antes, um `fallback={null}` por
  // dentro dessa fronteira era o que colapsava o <main>.
  return (
    <SpotDetailClient
      spot={spot}
      locale={locale}
      events={events}
      initialData={initialData ?? undefined}
      bakedAtMs={bakedAtMs}
    />
  )
}
