import Link from 'next/link';
import type { Spot } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { getMacroRegion } from '@/lib/regions';

/**
 * Breadcrumb «Portugal › Região › Spot» (#184) — estrutura herdada do hero
 * nacional: país liga à lista de spots filtrada pela região, a região liga à
 * âncora da região na lista, e o nome do spot fica como item corrente.
 */
export default function SpotBreadcrumb({
  spot,
  locale,
}: {
  spot: Spot;
  locale: string;
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const region = locale === 'pt' ? spot.region : spot.regionEn;
  const title = locale === 'pt' ? spot.name : spot.nameEn;
  // A etiqueta é o município do spot («Ericeira»); o filtro da lista é a
  // região macro («Lisboa») — os dois nomes não coincidem sempre.
  const macro = getMacroRegion(spot.region);
  const regionHref = macro
    ? `/${locale}/spots/?region=${encodeURIComponent(macro)}`
    : `/${locale}/spots/`;

  return (
    <nav aria-label={tq.breadcrumbAria} className="text-meta-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <li>
          <Link
            href={`/${locale}/spots/`}
            className="text-fg-muted underline decoration-divider-strong underline-offset-2 hover:text-fg transition-colors duration-150"
          >
            {tq.countryLabel}
          </Link>
        </li>
        <li aria-hidden className="text-fg-subtle">
          ›
        </li>
        <li>
          <Link
            href={regionHref}
            className="text-fg-muted underline decoration-divider-strong underline-offset-2 hover:text-fg transition-colors duration-150"
          >
            {region}
          </Link>
        </li>
        <li aria-hidden className="text-fg-subtle">
          ›
        </li>
        <li aria-current="page" className="text-fg">
          {title}
        </li>
      </ol>
    </nav>
  );
}
