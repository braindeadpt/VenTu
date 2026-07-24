import type { Metadata } from 'next';
import { locales, validateLocale } from '@/lib/i18n';
import { loadDirectoryFile } from '@/lib/directory';
import DirectoryClient from '@/components/directory/DirectoryClient';
import { buildPageMetadata } from '@/lib/seo';

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = validateLocale(raw);
  const isPt = locale === 'pt';
  return buildPageMetadata({
    locale,
    title: isPt
      ? 'Directório — escolas e lojas de desportos náuticos'
      : 'Directory — watersports schools and shops',
    description: isPt
      ? 'Escolas de surf, kite centers e lojas em Portugal. Lista e mapa — reclama o teu perfil.'
      : 'Surf schools, kite centers and shops in Portugal. List and map — claim your profile.',
    path: `/${locale}/diretorio/`,
  });
}

export default async function DiretorioPage({ params }: Props) {
  const { locale } = await params;
  const file = loadDirectoryFile();
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
      <DirectoryClient
        locale={locale}
        entries={file?.entries ?? []}
        generatedAt={file?.generatedAt}
      />
    </main>
  );
}
