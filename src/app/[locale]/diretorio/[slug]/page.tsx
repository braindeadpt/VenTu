import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { locales } from '@/lib/i18n';
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const entry = loadDirectoryEntries().find((e) => e.slug === slug);
  const isPt = locale === 'pt';
  if (!entry) {
    return { title: isPt ? 'Perfil' : 'Profile' };
  }
  const name = isPt ? entry.name : entry.nameEn || entry.name;
  return buildPageMetadata({
    locale: locale as 'pt' | 'en',
    title: `${name} — ${kindLabel(entry.kind, locale)}`,
    description: isPt
      ? `${name} no directório VenTu. Reclama o perfil se fores o responsável.`
      : `${name} on the VenTu directory. Claim the profile if you run this business.`,
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
