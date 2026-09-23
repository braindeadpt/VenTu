'use client';

import { usePathname } from 'next/navigation';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { MapPin, ArrowLeft, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';

export default function NotFoundContent() {
  const pathname = usePathname() || '';
  // The 404 lives outside the `[locale]` segment, so the locale comes from the
  // first path segment (`/es/...` → es). Unknown prefixes fall back to the
  // site default (pt) via `validateLocale`.
  const locale = validateLocale(pathname.split('/')[1] ?? '');
  const t = getTranslation(locale).notFound;

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <PageHeader
          align="center"
          icon={
            <div className="p-4 rounded-full bg-surface-1/[0.04] mx-auto w-fit">
              <MapPin className="w-8 h-8 text-data-waves" />
            </div>
          }
          title={t.title}
          subtitle={t.subtitle}
        />

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button href={`/${locale}/spots/`} size="lg">
            <Search className="w-4 h-4" aria-hidden />
            {t.viewAllSpots}
          </Button>
          <Button href={`/${locale}/`} variant="secondary" size="lg">
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {t.backHome}
          </Button>
        </div>
      </div>
    </div>
  );
}
