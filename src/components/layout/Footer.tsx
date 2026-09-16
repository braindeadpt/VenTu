import Link from 'next/link';
import { Wind, Github, Heart, ExternalLink, ChevronDown } from 'lucide-react';
import FeedbackForm from '@/components/FeedbackForm';
import DailyStreak from '@/components/layout/DailyStreak';
import { getTranslation } from '@/lib/i18n';
import { getPopularLandings, landingTitle } from '@/lib/seoLandings';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';

interface FooterProps {
  locale: string;
}

const linkClass =
  'inline-flex items-center min-h-[44px] md:min-h-0 text-sm text-fg-muted hover:text-fg transition-colors';

/**
 * Coluna do footer. Mobile: accordion nativo (<details>) — fechado por
 * omissão, o footer deixa de comer 40–60% do viewport. Desktop (md+): CSS
 * força o corpo visível e o summary fica inerte (ver globals.css).
 */
function FooterSection({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="footer-section">
      <summary className="footer-summary flex items-center justify-between gap-2 min-h-[44px] md:min-h-0 text-sm font-semibold text-fg uppercase tracking-wider cursor-pointer md:cursor-default select-none">
        {title}
        <ChevronDown
          className="footer-chevron w-4 h-4 md:hidden text-fg-muted transition-transform duration-150 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="footer-section-body mt-1 md:mt-4">{children}</div>
    </details>
  );
}

export default function Footer({ locale }: FooterProps) {
  const t = getTranslation(locale);
  const popularLandings = getPopularLandings();

  return (
    <footer className="border-t border-divider bg-bg-base/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-8">
          <div className="space-y-4 pb-4 md:pb-0">
            <div className="flex items-center gap-2">
              <Wind className="w-6 h-6 text-data-waves" />
              <span className="text-lg font-bold text-fg">Ven<span className="text-data-waves">Tu</span></span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              {t.footer.tagline.replace('{schedule}', pipelineSchedule(locale))}
            </p>
          </div>

          <FooterSection title={t.nav.explorar}>
            <ul className="space-y-0 md:space-y-2">
              {popularLandings.map((landing) => (
                <li key={landing.slug}>
                  <Link href={`/${locale}/explorar/${landing.slug}/`} className={linkClass}>
                    {landingTitle(landing, locale)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/${locale}/explorar/`} className={linkClass}>
                  {t.footer.allCombinations}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/diretorio/`} className={linkClass}>
                  {t.footer.directorySchools}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/livecams/`} className={linkClass}>
                  {t.footer.livecamsArrow}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/spots/`} className={linkClass}>
                  {t.footer.allSpotsArrow}
                </Link>
              </li>
            </ul>
          </FooterSection>

          <FooterSection title={t.footer.resources}>
            <ul className="space-y-0 md:space-y-2">
              <li>
                <Link href={`/${locale}/news/`} className={linkClass}>
                  {t.nav.news}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/sazonalidade/`} className={linkClass}>
                  {t.nav.sazonalidade}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/compare/`} className={linkClass}>
                  {t.nav.comparar}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/ferramentas/`} className={linkClass}>
                  {t.nav.tools}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/favorites/`} className={linkClass}>
                  {t.nav.favorites}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/passaporte/`} className={linkClass}>
                  {t.nav.passport}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/alerts/`} className={linkClass}>
                  {t.nav.alerts}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/about/`} className={linkClass}>
                  {t.nav.about}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/fontes/`} className={linkClass}>
                  {t.footer.fontes}
                </Link>
              </li>
            </ul>
          </FooterSection>

          <FooterSection title={t.footer.data}>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li>{t.footer.attribWaves}</li>
              <li>{t.footer.attribWind}</li>
              <li>
                {t.footer.attribObservations}{' '}
                <a
                  href="https://www.ipma.pt/"
                  className="underline hover:text-fg transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IPMA
                </a>
                {' · '}
                <a
                  href="https://www.ecowitt.net/"
                  className="underline hover:text-fg transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ecowitt
                </a>
                {' · '}
                <a
                  href="https://aviationweather.gov/"
                  className="underline hover:text-fg transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  METAR
                </a>
              </li>
              <li>{t.footer.attribNews}</li>
              <li className="pt-2 flex flex-col gap-1">
                <a
                  href="https://github.com/braindeadpt/ventu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  <Github className="w-4 h-4" />
                  GitHub ↗
                </a>
                <a
                  href="https://open-meteo.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open-Meteo ↗
                </a>
              </li>
            </ul>
          </FooterSection>
        </div>

        <p className="mt-8 text-xs text-fg-subtle leading-relaxed max-w-3xl">
          {t.footer.creditsImagery} {t.footer.creditsRegionPhotos}{' '}
          <a href="https://unsplash.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
            Unsplash
          </a>
          {' / '}
          <a href="https://www.pexels.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
            Pexels
          </a>
          . {t.footer.creditsSee}{' '}
          <Link href={`/${locale}/about/`} className="underline hover:text-fg-muted">
            {t.nav.about}
          </Link>{' '}
          {t.footer.creditsAnd} <code className="text-meta-sm">public/images/CREDITS.md</code>.
        </p>

        <div className="mt-6 pt-6 border-t border-divider flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-xs text-fg-subtle inline-flex items-center gap-2">
              © {new Date().getFullYear()} VenTu. MIT License. Open Source Project.
              <DailyStreak />
            </p>
            <FeedbackForm locale={locale} />
          </div>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-1 text-xs text-fg-subtle">
              {t.footer.madeWith} <Heart className="w-3 h-3 text-windDir-onshore" /> {t.footer.forCommunity}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
