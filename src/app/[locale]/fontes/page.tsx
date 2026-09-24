import type { ReactNode } from 'react'
import { Database, ExternalLink, ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata } from '@/lib/seo'
import { ATTRIBUTIONS, type DataSourceId } from '@/lib/dataSources'
import { loadCoastalWarningsArchive } from '@/lib/coastalWarningsArchive'
import CoastalArchiveCard from '@/components/fontes/CoastalArchiveCard'
import type { Metadata } from 'next'
import { getTranslation, validateLocale } from '@/lib/i18n'

/** Link externo pequeno (atribuição obrigatória). */
function A({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className="underline hover:text-fg transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
const CC_BY_NC = 'https://creativecommons.org/licenses/by-nc/4.0/'

type Source = {
  name: string
  homepage: string
  /** Chave do «o que o VenTu consome» no dicionário (`fontesSources`). */
  useKey: keyof ReturnType<typeof getTranslation>['fontesSources']
  /** Licença (com link). */
  license: { pt: ReactNode; en: ReactNode }
  /** ID da cadeia de atribuição no módulo partilhado (src/lib/dataSources.tsx). */
  attributionId: DataSourceId
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const loc = validateLocale(locale)
  const t = getTranslation(locale).fontesPage

  return buildPageMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    locale: loc,
    path: `/${loc}/fontes/`,
  })
}

export default async function DataSourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const t = getTranslation(locale).fontesPage

  // Baked once at build time; the client card re-derives from the committed
  // fixture under `ventu_live` so the visual gate measures the fixture, not the
  // day's build data (see CoastalArchiveCard).
  const archive = loadCoastalWarningsArchive()

  const sources: Source[] = [
    {
      name: 'Open-Meteo',
      homepage: 'https://open-meteo.com/',
      useKey: 'openMeteo',
      license: {
        pt: <><A href={CC_BY}>CC BY 4.0</A></>,
        en: <><A href={CC_BY}>CC BY 4.0</A></>,
      },
      attributionId: 'open-meteo',
    },
    {
      name: 'Instituto Hidrográfico (IH) — marés, isóbatas e avisos',
      homepage: 'https://www.hidrografico.pt/',
      useKey: 'ihTides',
      license: {
        pt: <><A href={CC_BY}>CC BY 4.0</A></>,
        en: <><A href={CC_BY}>CC BY 4.0</A></>,
      },
      attributionId: 'ih',
    },
    {
      name: 'Instituto Hidrográfico (IH) — boias ondógrafo',
      homepage: 'https://www.hidrografico.pt/',
      useKey: 'ihBuoys',
      license: {
        pt: <><A href={CC_BY_NC}>CC BY-NC 4.0</A></>,
        en: <><A href={CC_BY_NC}>CC BY-NC 4.0</A></>,
      },
      attributionId: 'ih-buoys',
    },
    {
      name: 'IPMA',
      homepage: 'https://www.ipma.pt/',
      useKey: 'ipma',
      license: {
        pt: <>Dados abertos IPMA (gratuito, sem key)</>,
        en: <>IPMA open data (free, no key)</>,
      },
      attributionId: 'ipma',
    },
    {
      name: 'MeteoAlarm (EUMETNET)',
      homepage: 'https://www.meteoalarm.org/',
      useKey: 'meteoalarm',
      license: {
        pt: <>Termos EUMETNET (MeteoGate / CAP)</>,
        en: <>EUMETNET terms (MeteoGate / CAP)</>,
      },
      attributionId: 'meteoalarm',
    },
    {
      name: 'Copernicus Marine Service',
      homepage: 'https://marine.copernicus.eu/',
      useKey: 'copernicus',
      license: {
        pt: <>Free; atribuição obrigatória</>,
        en: <>Free; attribution required</>,
      },
      attributionId: 'copernicus',
    },
    {
      name: 'EMODnet Bathymetry',
      homepage: 'https://emodnet.ec.europa.eu/en/bathymetry',
      useKey: 'emodnet',
      license: {
        pt: <><A href={CC_BY}>CC BY 4.0</A></>,
        en: <><A href={CC_BY}>CC BY 4.0</A></>,
      },
      attributionId: 'emodnet',
    },
    {
      name: 'OpenSeaMap',
      homepage: 'https://map.openseamap.org/',
      useKey: 'openseamap',
      license: {
        pt: <><A href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</A> + <A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM)</>,
        en: <><A href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</A> + <A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM)</>,
      },
      attributionId: 'openseamap',
    },
    {
      name: 'Esri World Imagery',
      homepage: 'https://www.esri.com/',
      useKey: 'esriImagery',
      license: {
        pt: <>Uso público gratuito com atribuição (Esri Master Agreement)</>,
        en: <>Free public use with attribution (Esri Master Agreement)</>,
      },
      attributionId: 'esri',
    },
    {
      name: 'OpenStreetMap / Esri Canvas',
      homepage: 'https://www.openstreetmap.org/copyright',
      useKey: 'osmEsriCanvas',
      license: {
        pt: <><A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM) + Esri Master Agreement</>,
        en: <><A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM) + Esri Master Agreement</>,
      },
      attributionId: 'osm',
    },
    {
      name: 'Ecowitt',
      homepage: 'https://www.ecowitt.net/',
      useKey: 'ecowitt',
      license: {
        pt: <>Dados comunitários (estações privadas)</>,
        en: <>Community data (private stations)</>,
      },
      attributionId: 'ecowitt',
    },
    {
      name: 'METAR (aviation weather)',
      homepage: 'https://aviationweather.gov/',
      useKey: 'metar',
      license: {
        pt: <>Domínio público (NOAA / WMO METAR)</>,
        en: <>Public domain (NOAA / WMO METAR)</>,
      },
      attributionId: 'metar',
    },
    {
      name: 'WeatherLink (Davis)',
      homepage: 'https://www.weatherlink.com/',
      useKey: 'weatherlink',
      license: {
        pt: <>Widget oficial WeatherLink</>,
        en: <>Official WeatherLink widget</>,
      },
      attributionId: 'weatherlink',
    },
    {
      name: 'Google Gemini',
      homepage: 'https://ai.google.dev/',
      useKey: 'gemini',
      license: {
        pt: <>Termos Google AI</>,
        en: <>Google AI terms</>,
      },
      attributionId: 'gemini',
    },
    {
      name: 'Unsplash / Pexels',
      homepage: 'https://unsplash.com/license',
      useKey: 'unsplash',
      license: {
        pt: (
          <>
            Licença livre para uso comercial — <A href="https://unsplash.com/license">Unsplash</A> · <A href="https://www.pexels.com/license/">Pexels</A>
          </>
        ),
        en: (
          <>
            Free licence for commercial use — <A href="https://unsplash.com/license">Unsplash</A> · <A href="https://www.pexels.com/license/">Pexels</A>
          </>
        ),
      },
      attributionId: 'unsplash',
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <PageHeader
        align="center"
        icon={<Database className="w-16 h-16 text-data-waves" aria-hidden />}
        title={t.title}
        subtitle={t.subtitle}
      />

      <div className="card-1 p-6 space-y-3">
        <p className="text-sm text-fg-muted leading-relaxed">
          <>{t.introA} <strong className="text-fg">{t.introStrong}</strong> {t.introB}</>
        </p>
        <p className="flex items-start gap-2 text-xs text-fg-subtle">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <>
            {t.aboutA}{' '}
            <a href={`/${locale}/about/`} className="underline hover:text-fg transition-colors">
              {t.aboutLink}
            </a>
            .
          </>
        </p>
      </div>

      <div className="card-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="data-sources-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle border-b border-divider">
              <th className="py-3 pr-4 font-semibold">{t.colSource}</th>
              <th className="py-3 pr-4 font-semibold">{t.colWhat}</th>
              <th className="py-3 pr-4 font-semibold">{t.colLicence}</th>
              <th className="py-3 font-semibold">{t.colAttribution}</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.name} className="border-b border-divider last:border-0 align-top" data-testid="data-source-row">
                <td className="py-3 pr-4 whitespace-nowrap">
                  <a
                    href={s.homepage}
                    className="inline-flex items-center gap-1 font-semibold text-fg hover:text-data-waves transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.name}
                    <ExternalLink className="w-3 h-3 text-fg-subtle" aria-hidden />
                  </a>
                </td>
                <td className="py-3 pr-4 text-fg-muted leading-snug">
                  {getTranslation(locale).fontesSources[s.useKey]}
                </td>
                <td className="py-3 pr-4 text-fg-muted leading-snug whitespace-nowrap">
                  {isPt ? s.license.pt : s.license.en}
                </td>
                <td className="py-3 text-fg-muted leading-snug">
                  {isPt
                    ? ATTRIBUTIONS[s.attributionId].cellPt
                    : ATTRIBUTIONS[s.attributionId].cellEn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CoastalArchiveCard locale={locale} baked={archive} />

      <p className="text-xs text-fg-subtle">
        {isPt ? (
          <>
            Nota de honestidade: as cadeias de atribuição do IPMA, IH e MeteoAlarm seguem as indicações das
            respectivas páginas oficiais e metadados; se uma entidade actualizar os termos, esta página e os
            rótulos na UI devem ser actualizados no mesmo run.
          </>
        ) : (
          <>
            Honesty note: the IPMA, IH and MeteoAlarm attribution strings follow their official pages and
            metadata; if an entity updates its terms, this page and the UI labels must be updated in the same run.
          </>
        )}
      </p>
    </div>
  )
}
