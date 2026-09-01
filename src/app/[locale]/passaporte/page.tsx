import { locales, getTranslation } from '@/lib/i18n';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import PassaporteClient from '@/components/passaporte/PassaporteClient';

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const p = getTranslation(locale).passaporte;
  return buildPageMetadata({
    locale: locale as 'pt' | 'en' | 'es' | 'de' | 'fr',
    title: p.metaTitle,
    description: p.metaDescription,
    path: `/${locale}/passaporte/`,
  });
}

export default async function PassaportePage({ params }: Props) {
  const { locale } = await params;
  return <PassaporteClient locale={locale} />;
}