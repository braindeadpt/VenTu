/**
 * /[locale]/lab/mar-vivo/ — protótipo «Mar vivo» (hero da homepage).
 * Rota de laboratório: noindex, fora do sitemap, sem links a partir do site.
 */
import type { Metadata } from 'next';
import { locales, validateLocale } from '@/lib/i18n';
import { SCORE_TIER_THRESHOLDS } from '@/lib/sportScore';
import MarVivoLoader from '@/components/lab/mar-vivo/MarVivoLoader';
import { buildSeeds, buildSwellSnapshot } from '@/components/lab/mar-vivo/serverData';
import { marVivoStrings } from '@/components/lab/mar-vivo/strings';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = marVivoStrings(validateLocale(locale));
  return {
    title: s.metaTitle,
    description: s.metaDescription,
    robots: { index: false, follow: false },
  };
}

export default async function MarVivoLabPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc = validateLocale(locale);
  return (
    <MarVivoLoader
      locale={loc}
      seeds={buildSeeds(loc)}
      swell={buildSwellSnapshot()}
      thresholds={{ ...SCORE_TIER_THRESHOLDS }}
    />
  );
}
