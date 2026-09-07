import type { Metadata } from 'next';
import { locales } from '@/lib/i18n';
import { aliasTargetPath } from '@/lib/pathAliases';
import StaticAliasRedirect from '@/components/routing/StaticAliasRedirect';

interface Props {
  params: Promise<{ locale: string }>;
}

const CANONICAL = 'about';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const target = aliasTargetPath(locale, CANONICAL);
  return {
    title: 'Sobre → VenTu',
    robots: { index: false, follow: true },
    alternates: { canonical: target },
  };
}

/** PT mental-model alias → canonical `/about/`. */
export default async function SobreAliasPage({ params }: Props) {
  const { locale } = await params;
  const href = aliasTargetPath(locale, CANONICAL);
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{location.replace(${JSON.stringify(href)})}catch(e){}`,
        }}
      />
      <StaticAliasRedirect locale={locale} canonical={CANONICAL} />
    </>
  );
}
