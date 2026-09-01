import type { Metadata } from 'next';
import { getTranslation, locales } from '@/lib/i18n';
import { loadDirectoryEntries } from '@/lib/directory';
import DirectoryManageClient from '@/components/directory/DirectoryManageClient';
import type { DirectoryEntry } from '@/types/directory';

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  return {
    title: getTranslation(isPt ? 'pt' : 'en').directory.manageSchoolsTitle,
    robots: { index: false, follow: false },
  };
}

export default async function DiretorioGerirPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seedById: Record<string, DirectoryEntry> = {};
  for (const e of loadDirectoryEntries()) {
    seedById[e.id] = e;
  }
  return <DirectoryManageClient locale={locale} seedById={seedById} />;
}
