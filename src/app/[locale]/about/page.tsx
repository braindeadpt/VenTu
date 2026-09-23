import { Wind, Waves, Database, Brain, Code, Heart, Globe, Zap, Shield } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { buildPageMetadata } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import { loadForecastSkillBuoys } from '@/lib/forecastSkill'
import { loadIhKeyStatus } from '@/lib/ihKeyStatus'
import { loadTideLayerStatus } from '@/lib/tideLayerStatus'
import { loadRadarLayerStatus } from '@/lib/radarLayerStatus'

import { loadCoastalWarningsArchive } from '@/lib/coastalWarningsArchive'

import { OpenMeteoAttribution } from '@/lib/openMeteoAttribution'
import WaveBiasSection from '@/components/spots/WaveBiasSection'
import CoherenceTrendSection from '@/components/spots/CoherenceTrendSection'
import AboutDataCards from '@/components/about/AboutDataCards'
import { getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'




export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const loc = isPt ? 'pt' : 'en'
  const t = getTranslation(locale).about

  return buildPageMetadata({
    title: t.pageMetaTitle,
    description: t.pageMetaDescription,
    locale: loc,
    path: `/${loc}/about/`,
  })
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const t = getTranslation(locale).about

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <PageHeader
        align="center"
        icon={<Wind className="w-16 h-16 text-data-waves" aria-hidden />}
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
      />

      <div className="card-1 p-8 space-y-6">
        <h2 className="text-2xl font-bold text-fg">{t.missionHeading}</h2>
        <p className="text-fg-muted leading-relaxed">{t.missionBody}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-1 p-6 text-center space-y-4">
          <Database className="w-10 h-10 text-data-waves mx-auto" />
          <h3 className="text-lg font-semibold">{t.cardDataTitle}</h3>
          <p className="text-sm text-fg-muted">
            {t.cardDataBody.replace('{schedule}', pipelineSchedule(isPt ? 'pt' : 'en'))}
          </p>
        </div>
        <div className="card-1 p-6 text-center space-y-4">
          <Brain className="w-10 h-10 text-data-wind mx-auto" />
          <h3 className="text-lg font-semibold">{t.cardAiTitle}</h3>
          <p className="text-sm text-fg-muted">{t.cardAiBody}</p>
        </div>
        <div className="card-1 p-6 text-center space-y-4">
          <Code className="w-10 h-10 text-data-waves mx-auto" />
          <h3 className="text-lg font-semibold">{t.cardOssTitle}</h3>
          <p className="text-sm text-fg-muted">{t.cardOssBody}</p>
        </div>
      </div>

      <div className="card-1 p-8 space-y-6">
        <h2 className="text-2xl font-bold text-fg">{t.techHeading}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Zap className="w-6 h-6" />, name: 'Next.js 16', desc: t.techNextDesc },
            { icon: <Wind className="w-6 h-6" />, name: 'Tailwind CSS', desc: t.techTailwindDesc },
            { icon: <Waves className="w-6 h-6" />, name: 'Leaflet', desc: t.techLeafletDesc },
            { icon: <Globe className="w-6 h-6" />, name: 'Open-Meteo', desc: t.techOpenMeteoDesc },
            { icon: <Wind className="w-6 h-6" />, name: 'IPMA · Ecowitt', desc: t.techObservations },
            { icon: <Brain className="w-6 h-6" />, name: 'Gemini Flash', desc: t.techGeminiDesc },
            { icon: <Shield className="w-6 h-6" />, name: 'Supabase', desc: t.techSupabaseDesc },
          ].map((tech, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-1/[0.04]">
              <div className="text-data-waves">{tech.icon}</div>
              <div>
                <p className="text-sm font-medium">{tech.name}</p>
                <p className="text-xs text-fg-muted">{tech.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-1 p-8 space-y-4">
        <h2 className="text-2xl font-bold text-fg">{t.attributionHeading}</h2>
        <ul className="text-sm text-fg-muted space-y-2 list-disc pl-5">
          <li>
            <>{t.attrForecastsLabel} <OpenMeteoAttribution className="underline hover:text-fg transition-colors" />{' '}
            {t.attrForecastsMid}{' '}
            <a href="https://www.dwd.de/" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
              DWD EWAM
            </a>{' '}
            {t.attrForecastsAnd}{' '}
            <a href="https://www.ecmwf.int/" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
              ECMWF WAM
            </a>{' '}
            {t.attrForecastsTail}</>
          </li>
          <li>
            <>{t.attrCitationLabel}{' '}
            <em className="not-italic">Zippenfenig, P. (2023). Open-Meteo.com Weather API [Computer software].</em>{' '}
            Zenodo.{' '}
            <a href="https://doi.org/10.5281/zenodo.7970649" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
              https://doi.org/10.5281/zenodo.7970649
            </a>
            .</>
          </li>
          <li>
            <>{t.attrProjectA}{' '}
            <a
              href="https://github.com/braindeadpt/VenTu/blob/main/CITATION.cff"
              className="underline hover:text-fg transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              CITATION.cff
            </a>{' '}
            {t.attrProjectB}</>
          </li>
          <li>{t.attrThumbnails}</li>
          <li>
            <strong className="text-fg">Imagery © Esri, Maxar, Earthstar Geographics</strong>
          </li>
          <li>
            <>{t.attrPhotosA}{' '}
              <a href="/images/CREDITS.md" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
                public/images/CREDITS.md</a
              >.</>
          </li>
          <li>
            <>{t.attrSourcesA}{' '}
              <a href={`/${locale}/fontes/`} className="underline hover:text-fg transition-colors">
                {t.attrSourcesLink}
              </a>
              .</>
          </li>
        </ul>
      </div>

<AboutDataCards
        locale={locale}
        bakedKey={loadIhKeyStatus()}
        bakedTide={loadTideLayerStatus()}
        bakedRadar={loadRadarLayerStatus()}
        bakedSkill={loadForecastSkillBuoys()}
        bakedArchive={loadCoastalWarningsArchive()}
      />

      <WaveBiasSection isPt={isPt} />
      <CoherenceTrendSection isPt={isPt} />

      <div className="text-center space-y-4">
        <p className="flex items-center justify-center gap-2 text-fg-muted">
          <Heart className="w-5 h-5 text-windDir-onshore" />
          {isPt ? 'Feito com paixão pela comunidade náutica portuguesa' : 'Made with passion for the Portuguese nautical community'}
        </p>
        <Button
          href="https://github.com/braindeadpt/ventu"
          variant="secondary"
          size="lg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code className="w-5 h-5" aria-hidden />
          {isPt ? 'Contribuir no GitHub ↗' : 'Contribute on GitHub ↗'}
        </Button>
      </div>
    </div>
  )
}
