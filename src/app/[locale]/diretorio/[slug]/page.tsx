import { localizedSpotName } from '@/lib/localizedSpotText';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslation, locales, validateLocale } from '@/lib/i18n';
import { kindLabel, loadDirectoryEntries } from '@/lib/directory';
import { buildPageMetadata } from '@/lib/seo';
import DirectoryDetailClient from '@/components/directory/DirectoryDetailClient';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const entries = loadDirectoryEntries();
  if (entries.length === 0) {
    return locales.map((locale) => ({ locale, slug: '_placeholder' }));
  }
  return locales.flatMap((locale) =>
    entries.map((e) => ({ locale, slug: e.slug })),
  );
}

// D10 — params exaustivos: slug sem entrada no directório (ex.: «lisboa») →
// 404 (produção: 404.html; dev: 404 após o padrão ter servido um slug válido
// — o guard E443 do Next a frio dá 500, limitação upstream next.js#56253).
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const entry = loadDirectoryEntries().find((e) => e.slug === slug);
  const isPt = locale === 'pt';
  const dv = getTranslation(locale).directory;
  if (!entry) {
    return { title: dv.profile };
  }
  const name = localizedSpotName(entry, locale);
  return buildPageMetadata({
    locale: validateLocale(locale),
    title: `${name} — ${kindLabel(entry.kind, locale)}`,
    description: getTranslation(locale).pages.directoryProfileMetaDescription.replace(
      '{name}',
      name,
    ),
    path: `/${locale}/diretorio/${entry.slug}/`,
  });
}

export default async function DiretorioDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (slug === '_placeholder') notFound();

  const entry = loadDirectoryEntries().find((e) => e.slug === slug);
  if (!entry) notFound();

  return <DirectoryDetailClient locale={locale} entry={entry} />;
}
