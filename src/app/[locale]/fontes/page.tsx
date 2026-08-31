import type { ReactNode } from 'react'
import { Database, ExternalLink, ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

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

type Source = {
  name: string
  homepage: string
  /** O que o VenTu consome desta fonte. */
  usePt: string
  useEn: string
  /** Licença (com link). */
  license: { pt: ReactNode; en: ReactNode }
  /** Cadeia de atribuição obrigatória a reproduzir. */
  attribution: { pt: ReactNode; en: ReactNode }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const loc = isPt ? 'pt' : 'en'

  return buildPageMetadata({
    title: isPt ? 'Fontes de dados — VenTu' : 'Data sources — VenTu',
    description: isPt
      ? 'Todas as fontes de dados do VenTu, com licença e atribuição obrigatória (Open-Meteo, IPMA, IH, MeteoAlarm, Esri, Copernicus).'
      : 'Every VenTu data source, with license and mandatory attribution (Open-Meteo, IPMA, IH, MeteoAlarm, Esri, Copernicus).',
    locale: loc,
    path: `/${loc}/fontes/`,
  })
}

export default async function DataSourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'

  const sources: Source[] = [
    {
      name: 'Open-Meteo',
      homepage: 'https://open-meteo.com/',
      usePt: 'Previsões de ondas, vento e marés (MSL) para todos os spots + ERA5 (Historical Marine) para viés/skill do modelo.',
      useEn: 'Wave, wind and tide (MSL) forecasts for every spot + ERA5 (Historical Marine) for model bias/skill.',
      license: {
        pt: <><A href={CC_BY}>CC BY 4.0</A></>,
        en: <><A href={CC_BY}>CC BY 4.0</A></>,
      },
      attribution: {
        pt: (
          <>
            «<A href="https://open-meteo.com/">Weather data by Open-Meteo.com</A> ({<A href={CC_BY}>CC BY 4.0</A>})» — já no mapa, no About e no footer. Modelos: ondas DWD EWAM e ECMWF WAM (CC-BY), NOAA GFS Wave/GWAM; vento DWD ICON-EU, ECMWF IFS, GFS e Météo-France.
          </>
        ),
        en: (
          <>
            “<A href="https://open-meteo.com/">Weather data by Open-Meteo.com</A> ({<A href={CC_BY}>CC BY 4.0</A>})” — already on the map, About and footer. Models: waves DWD EWAM & ECMWF WAM (CC-BY), NOAA GFS Wave/GWAM; wind DWD ICON-EU, ECMWF IFS, GFS & Météo-France.
          </>
        ),
      },
    },
    {
      name: 'Instituto Hidrográfico (IH)',
      homepage: 'https://www.hidrografico.pt/',
      usePt: 'Marés observadas (OGC API), estações de boias Datawell + Fugro (OGC API keyless; séries de onda com IH_API_KEY), isóbatas costeiras 8/16/30 m e avisos à navegação costeiros.',
      useEn: 'Observed tides (OGC API), Datawell + Fugro buoy stations (keyless OGC API; wave series with IH_API_KEY), coastal isobaths 8/16/30 m and coastal navigation warnings.',
      license: {
        pt: <><A href={CC_BY}>CC BY 4.0</A></>,
        en: <><A href={CC_BY}>CC BY 4.0</A></>,
      },
      attribution: {
        pt: (
          <>
            «Dados © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (<A href={CC_BY}>CC BY 4.0</A>)» — na secção de marés, no card de isóbatas e nos avisos à navegação.
          </>
        ),
        en: (
          <>
            “Data © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (<A href={CC_BY}>CC BY 4.0</A>)” — in the tides section, the isobaths card and navigation warnings.
          </>
        ),
      },
    },
    {
      name: 'IPMA',
      homepage: 'https://www.ipma.pt/',
      usePt: 'Avisos meteorológicos (warnings_www.json), radar de precipitação (frames 5 min) e observações de vento de estações.',
      useEn: 'Weather warnings (warnings_www.json), rain radar (5-min frames) and wind observations from stations.',
      license: {
        pt: <>Dados abertos IPMA (gratuito, sem key)</>,
        en: <>IPMA open data (free, no key)</>,
      },
      attribution: {
        pt: (
          <>
            «Dados <A href="https://www.ipma.pt/">IPMA</A>» — no radar (badge «IPMA»), nos avisos e nas observações de vento.
          </>
        ),
        en: (
          <>
            “<A href="https://www.ipma.pt/">IPMA</A> data” — on the radar (IPMA badge), warnings and wind observations.
          </>
        ),
      },
    },
    {
      name: 'MeteoAlarm (EUMETNET)',
      homepage: 'https://www.meteoalarm.org/',
      usePt: 'Fallback dos avisos meteorológicos quando o IPMA está em baixo (API OGC EDR + CAP, token grátis).',
      useEn: 'Weather warnings fallback when IPMA is down (OGC EDR + CAP API, free token).',
      license: {
        pt: <>Termos EUMETNET (token grátis METEOALARM_API_KEY)</>,
        en: <>EUMETNET terms (free METEOALARM_API_KEY token)</>,
      },
      attribution: {
        pt: (
          <>
            «Avisos <A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET)» — mostrado na secção de avisos quando a fonte é meteoalarm.
          </>
        ),
        en: (
          <>
            “<A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET) warnings” — shown in the warnings section when the source is meteoalarm.
          </>
        ),
      },
    },
    {
      name: 'Copernicus Marine Service',
      homepage: 'https://marine.copernicus.eu/',
      usePt: 'Boias espanholas (Puertos del Estado) via bucket WMO/GTS público — fallback cross-border do observedWave (sem key).',
      useEn: 'Spanish buoys (Puertos del Estado) via the public WMO/GTS bucket — keyless cross-border observedWave fallback.',
      license: {
        pt: <>Free; atribuição obrigatória</>,
        en: <>Free; attribution required</>,
      },
      attribution: {
        pt: (
          <>
            «Generated using E.U. <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>» — nas leituras WMO (boia Silleiro/Villano etc.).
          </>
        ),
        en: (
          <>
            “Generated using E.U. <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>” — on WMO readings (Silleiro/Villano buoys, etc.).
          </>
        ),
      },
    },
    {
      name: 'Esri World Imagery',
      homepage: 'https://www.esri.com/',
      usePt: 'Tiles de satélite no mapa + miniaturas dos spots exportadas nas coordenadas reais de cada praia.',
      useEn: 'Satellite tiles on the map + spot thumbnails exported at each beach’s real coordinates.',
      license: {
        pt: <>Uso público gratuito com atribuição (Esri Master Agreement)</>,
        en: <>Free public use with attribution (Esri Master Agreement)</>,
      },
      attribution: {
        pt: (
          <>
            «Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar Geographics» — no About e no controlo de atribuição do mapa.
          </>
        ),
        en: (
          <>
            “Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar Geographics” — on the About page and the map attribution control.
          </>
        ),
      },
    },
    {
      name: 'OpenStreetMap / CARTO',
      homepage: 'https://www.openstreetmap.org/copyright',
      usePt: 'Basemap vector claro/escuro do mapa de spots.',
      useEn: 'Light/dark vector basemap for the spots map.',
      license: {
        pt: <><A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM) + termos CARTO</>,
        en: <><A href="https://www.openstreetmap.org/copyright">ODbL</A> (OSM) + CARTO terms</>,
      },
      attribution: {
        pt: (
          <>
            «© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A> contributors © <A href="https://carto.com/attributions">CARTO</A>» — no controlo de atribuição do mapa.
          </>
        ),
        en: (
          <>
            “© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A> contributors © <A href="https://carto.com/attributions">CARTO</A>” — on the map attribution control.
          </>
        ),
      },
    },
    {
      name: 'Ecowitt',
      homepage: 'https://www.ecowitt.net/',
      usePt: 'Estações meteorológicas da comunidade perto dos spots (vento, temperatura).',
      useEn: 'Community weather stations near spots (wind, temperature).',
      license: {
        pt: <>Dados comunitários (estações privadas)</>,
        en: <>Community data (private stations)</>,
      },
      attribution: {
        pt: (
          <>
            «<A href="https://www.ecowitt.net/">Ecowitt</A>» — na atribuição das observações de vento.
          </>
        ),
        en: (
          <>
            “<A href="https://www.ecowitt.net/">Ecowitt</A>” — in the wind observation attribution.
          </>
        ),
      },
    },
    {
      name: 'METAR (aviation weather)',
      homepage: 'https://aviationweather.gov/',
      usePt: 'Vento de aeroportos próximos para validar/blendar o vento costeiro.',
      useEn: 'Airport wind near the coast to validate/blend coastal wind.',
      license: {
        pt: <>Domínio público (NOAA / WMO METAR)</>,
        en: <>Public domain (NOAA / WMO METAR)</>,
      },
      attribution: {
        pt: (
          <>
            «METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>» — na atribuição das observações de vento.
          </>
        ),
        en: (
          <>
            “METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>” — in the wind observation attribution.
          </>
        ),
      },
    },
    {
      name: 'WeatherLink (Davis)',
      homepage: 'https://www.weatherlink.com/',
      usePt: 'Sensores Davis na praia (vento, temperatura, humidade) — embed do spot.',
      useEn: 'Davis beach sensors (wind, temperature, humidity) — spot embed.',
      license: {
        pt: <>Widget oficial WeatherLink</>,
        en: <>Official WeatherLink widget</>,
      },
      attribution: {
        pt: (
          <>
            «<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis» — no embed da secção de sensores.
          </>
        ),
        en: (
          <>
            “<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis” — on the sensors embed section.
          </>
        ),
      },
    },
    {
      name: 'Google Gemini',
      homepage: 'https://ai.google.dev/',
      usePt: 'Resumos de notícias náuticas gerados por IA (Gemini Flash).',
      useEn: 'AI-generated nautical news summaries (Gemini Flash).',
      license: {
        pt: <>Termos Google AI</>,
        en: <>Google AI terms</>,
      },
      attribution: {
        pt: (
          <>
            «Gerado com <A href="https://ai.google.dev/">Google Gemini</A>» — nas notícias e no Dawn Patrol.
          </>
        ),
        en: (
          <>
            “Generated with <A href="https://ai.google.dev/">Google Gemini</A>” — on the news and Dawn Patrol.
          </>
        ),
      },
    },
    {
      name: 'Unsplash / Pexels',
      homepage: 'https://unsplash.com/license',
      usePt: 'Fotografias de ambiente por região (home, explorar, sobre).',
      useEn: 'Regional lifestyle photography (home, explore, about).',
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
      attribution: {
        pt: <>Lista completa de créditos em <code className="text-fg">public/images/CREDITS.md</code>.</>,
        en: <>Full credit list in <code className="text-fg">public/images/CREDITS.md</code>.</>,
      },
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <PageHeader
        align="center"
        icon={<Database className="w-16 h-16 text-data-waves" aria-hidden />}
        title={isPt ? 'Fontes de dados' : 'Data sources'}
        subtitle={
          isPt
            ? 'Cada fonte com a respectiva licença e a atribuição obrigatória que o VenTu reproduz'
            : 'Every source with its licence and the mandatory attribution VenTu reproduces'
        }
      />

      <div className="card-1 p-6 space-y-3">
        <p className="text-sm text-fg-muted leading-relaxed">
          {isPt ? (
            <>
              O VenTu agrega dados de várias entidades públicas e serviços gratuitos. As atribuições abaixo
              são <strong className="text-fg">obrigatórias</strong> pelas respectivas licenças e aparecem onde os
              dados são mostrados (mapa, secções de spot, About). Qualquer uso dos dados fora do VenTu deve
              preservar estas cadeias de atribuição.
            </>
          ) : (
            <>
              VenTu aggregates data from public entities and free services. The attributions below are{' '}
              <strong className="text-fg">mandatory</strong> under their licences and appear wherever the data is
              shown (map, spot sections, About). Any use of the data outside VenTu must preserve these
              attribution strings.
            </>
          )}
        </p>
        <p className="flex items-start gap-2 text-xs text-fg-subtle">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          {isPt ? (
            <>
              Detalhe completo dos modelos e da cadeia de previsão na página{' '}
              <a href={`/${locale}/about/`} className="underline hover:text-fg transition-colors">
                Sobre
              </a>
              .
            </>
          ) : (
            <>
              Full model and forecast-chain detail on the{' '}
              <a href={`/${locale}/about/`} className="underline hover:text-fg transition-colors">
                About
              </a>{' '}
              page.
            </>
          )}
        </p>
      </div>

      <div className="card-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="data-sources-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle border-b border-divider">
              <th className="py-3 pr-4 font-semibold">{isPt ? 'Fonte' : 'Source'}</th>
              <th className="py-3 pr-4 font-semibold">{isPt ? 'O que usamos' : 'What we use'}</th>
              <th className="py-3 pr-4 font-semibold">{isPt ? 'Licença' : 'Licence'}</th>
              <th className="py-3 font-semibold">{isPt ? 'Atribuição obrigatória' : 'Mandatory attribution'}</th>
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
                  {isPt ? s.usePt : s.useEn}
                </td>
                <td className="py-3 pr-4 text-fg-muted leading-snug whitespace-nowrap">
                  {isPt ? s.license.pt : s.license.en}
                </td>
                <td className="py-3 text-fg-muted leading-snug">
                  {isPt ? s.attribution.pt : s.attribution.en}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
