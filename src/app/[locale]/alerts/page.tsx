import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, MapPin } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { validateLocale } from '@/lib/i18n';
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
  const isPt = locale === 'pt';
  const loc = isPt ? 'pt' : 'en';

  return buildPageMetadata({
    title: isPt ? 'Alertas por email — VenTu' : 'Email alerts — VenTu',
    description: isPt
      ? 'Activa alertas nos teus favoritos — um email quando algum spot atingir o score mínimo.'
      : 'Enable alerts on your favorites — one email when any spot hits your minimum score.',
    locale: loc,
    path: `/${loc}/alerts/`,
  });
}

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = validateLocale(rawLocale);
  const isPt = locale === 'pt';

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2/[0.08] border border-divider">
            <Bell className="w-6 h-6 text-data-waves" aria-hidden />
          </span>
          <h1 className="text-display-lg text-fg tracking-tight">
            {isPt ? 'Alertas por email' : 'Email alerts'}
          </h1>
        </div>

        <p className="text-body-lg text-fg-muted mb-8">
          {isPt
            ? 'Guarda spots nos favoritos e activa alertas num só passo — recebes um email quando algum favorito atingir o score mínimo.'
            : 'Save spots to favorites and enable alerts in one step — get one email when any favorite hits your minimum score.'}
        </p>

        <ol className="space-y-3 mb-10 text-body text-fg-muted list-decimal list-inside">
          <li>{isPt ? 'Entra com magic link' : 'Sign in with a magic link'}</li>
          <li>{isPt ? 'Guarda spots nos favoritos' : 'Save spots to favorites'}</li>
          <li>{isPt ? 'Em /favorites, activa alertas e confirma por email' : 'On /favorites, enable alerts and confirm by email'}</li>
        </ol>

        <div className="flex flex-wrap gap-3 mb-8">
          <Button href={`/${locale}/favorites/#alertas`} size="lg" locale={locale}>
            {isPt ? 'Activar nos favoritos' : 'Enable on favorites'}
          </Button>
          <Button
            href={`/${locale}/conta/`}
            variant="secondary"
            size="lg"
            locale={locale}
          >
            {isPt ? 'Entrar na conta' : 'Sign in'}
          </Button>
        </div>

        <h2 className="text-h3 text-fg mb-3">
          {isPt ? 'Spots populares' : 'Popular spots'}
        </h2>
        <ul className="grid gap-2 list-none p-0 m-0 mb-8">
          {FEATURED_SPOTS.map((spot) => (
            <li key={spot.slug}>
              <Card
                href={`/${locale}/spots/${spot.slug}/`}
                hoverable
                padding={false}
                className="p-4 flex items-center justify-between gap-3"
              >
                <span className="font-semibold text-fg">
                  {isPt ? spot.namePt : spot.nameEn}
                </span>
                <MapPin className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />
              </Card>
            </li>
          ))}
        </ul>

        <p className="text-meta text-fg-muted mt-8">
          {isPt ? 'Já tens um link de confirmação ou cancelamento? ' : 'Already have a confirm or unsubscribe link? '}
          <Link href={`/${locale}/alerts/confirm/`} className="text-data-waves hover:underline">
            {isPt ? 'Confirmar' : 'Confirm'}
          </Link>
          {' · '}
          <Link href={`/${locale}/alerts/unsubscribe/`} className="text-data-waves hover:underline">
            {isPt ? 'Cancelar subscrição' : 'Unsubscribe'}
          </Link>
        </p>
      </div>
    </div>
  );
}
