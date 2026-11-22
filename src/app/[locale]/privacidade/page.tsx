import { ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata } from '@/lib/seo'
import { getTranslation, validateLocale } from '@/lib/i18n'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = validateLocale(locale)
  const t = getTranslation(locale).privacy

  return buildPageMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    locale: loc,
    path: `/${loc}/privacidade/`,
  })
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="text-fg-muted leading-relaxed">{body}</p>
    </section>
  )
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = getTranslation(locale).privacy

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <PageHeader
        align="center"
        icon={<ShieldCheck className="w-14 h-14 text-data-waves" aria-hidden />}
        title={t.title}
        subtitle={t.subtitle}
      />
      <p className="text-sm text-fg-subtle text-center">{t.updated}</p>
      <p className="text-fg-muted leading-relaxed">{t.introBody}</p>
      <Section title={t.secLocationTitle} body={t.secLocationBody} />
      <Section title={t.secAccountTitle} body={t.secAccountBody} />
      <Section title={t.secPrefsTitle} body={t.secPrefsBody} />
      <Section title={t.secFeedbackTitle} body={t.secFeedbackBody} />
      <Section title={t.secAnalyticsTitle} body={t.secAnalyticsBody} />
      <Section title={t.secThirdTitle} body={t.secThirdBody} />
      <Section title={t.secCookiesTitle} body={t.secCookiesBody} />
      <Section title={t.secShareTitle} body={t.secShareBody} />
      <Section title={t.secRightsTitle} body={t.secRightsBody} />
      <Section title={t.secContactTitle} body={t.secContactBody} />
      <Section title={t.secChangesTitle} body={t.secChangesBody} />
    </div>
  )
}
