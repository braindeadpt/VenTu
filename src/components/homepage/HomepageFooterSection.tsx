import { getTranslation } from '@/lib/i18n';
import Link from 'next/link';
import TrustStrip from '@/components/homepage/TrustStrip';

interface HomepageFooterSectionProps {
  locale: string;
  spotCount: number;
  sportsCount: number;
}

/**
 * Pre-footer em duas linhas (auditoria C3): uma linha de links para as
 * ferramentas secundárias + a linha de confiança — sem grelha de cards.
 */
export default function HomepageFooterSection({
  locale,
  spotCount,
  sportsCount,
}: HomepageFooterSectionProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);

  const links = [
    { href: `/${locale}/sazonalidade/`, label: t.homepage.seasonality },
    { href: `/${locale}/compare/`, label: t.homepage.compareSpots },
    { href: `/${locale}/favorites/`, label: t.homepage.favorites },
  ];

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8"
      aria-label={t.homepage.moreTools}
    >
      <ul className="flex flex-wrap items-center list-none p-0 m-0 text-meta">
        <li className="text-fg-muted pr-1 py-2">
          {t.homepage.moreToExplore}
        </li>
        {links.map((l) => (
          <li key={l.href} className="flex items-center">
            <span aria-hidden className="text-fg-subtle px-1">
              ·
            </span>
            <Link
              href={l.href}
              className="inline-flex min-h-[44px] items-center px-1 font-medium text-fg hover:text-accent transition-colors duration-150"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <TrustStrip
        spotCount={spotCount}
        sportsCount={sportsCount}
        locale={locale}
        variant="inline"
      />
    </section>
  );
}
