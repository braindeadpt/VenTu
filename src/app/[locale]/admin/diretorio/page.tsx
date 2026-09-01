import DirectoryAdminClient from '@/components/admin/DirectoryAdminClient';
import { getTranslation, locales } from '@/lib/i18n';
import { loadDirectoryEntries } from '@/lib/directory';
import type { Metadata } from 'next';

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
    title: getTranslation(isPt ? 'pt' : 'en').admin.metaTitleDirectory,
    robots: { index: false, follow: false },
  };
}

export default async function AdminDiretorioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seedNames: Record<string, string> = {};
  for (const e of loadDirectoryEntries()) {
    seedNames[e.id] = e.name;
  }
  return <DirectoryAdminClient locale={locale} seedNames={seedNames} />;
}
