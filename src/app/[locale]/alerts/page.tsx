import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, MapPin } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { validateLocale, getTranslation } from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';

const FEATURED_SPOTS = [
  { slug: 'guincho', namePt: 'Guincho', nameEn: 'Guincho' },
  { slug: 'nazare', namePt: 'Nazaré', nameEn: 'Nazaré' },
  { slug: 'lagos', namePt: 'Lagos', nameEn: 'Lagos' },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const a = getTranslation(locale).alerts;

  return buildPageMetadata({
    title: a.metaTitle,
    description: a.metaDescription,
    locale: locale as 'pt' | 'en' | 'es' | 'de' | 'fr',
    path: `/${locale}/alerts/`,
  });
}

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = validateLocale(rawLocale);
  const a = getTranslation(locale).alerts;

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2/[0.08] border border-divider">
            <Bell className="w-6 h-6 text-data-waves" aria-hidden />
          </span>
          <h1 className="text-display-lg text-fg tracking-tight">{a.emailAlerts}</h1>
        </div>

        <p className="text-body-lg text-fg-muted mb-8">{a.intro}</p>

        <ol className="space-y-3 mb-10 text-body text-fg-muted list-decimal list-inside">
          <li>{a.step1}</li>
          <li>{a.step2}</li>
          <li>{a.step3}</li>
        </ol>

        <div className="flex flex-wrap gap-3 mb-8">
          <Button href={`/${locale}/favorites/#alertas`} size="lg" locale={locale}>
            {a.enableOnFavorites}
          </Button>
          <Button
            href={`/${locale}/conta/`}
            variant="secondary"
            size="lg"
            locale={locale}
          >
            {a.signIn}
          </Button>
        </div>

        <h2 className="text-h3 text-fg mb-3">{a.popularSpots}</h2>
        <ul className="grid gap-2 list-none p-0 m-0 mb-8">
          {FEATURED_SPOTS.map((spot) => (
            <li key={spot.slug}>
              <Card
                href={`/${locale}/spots/${spot.slug}/`}
                hoverable
                padding={false}
                className="p-4 flex items-center justify-between gap-3"
              >
                <span className="font-semibold text-fg">{spot.nameEn}</span>
                <MapPin className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />
              </Card>
            </li>
          ))}
        </ul>

        <p className="text-meta text-fg-muted mt-8">
          {a.haveALink}
          <Link href={`/${locale}/alerts/confirm/`} className="text-data-waves underline underline-offset-2 hover:text-data-waves/80">
            {a.confirmLink}
          </Link>
          {' · '}
          <Link href={`/${locale}/alerts/unsubscribe/`} className="text-data-waves underline underline-offset-2 hover:text-data-waves/80">
            {a.unsubscribeLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
