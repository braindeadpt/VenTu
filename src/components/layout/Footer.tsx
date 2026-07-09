import Link from 'next/link';
import { Wind, Github, Heart, ExternalLink } from 'lucide-react';
import FeedbackForm from '@/components/FeedbackForm';
import DailyStreak from '@/components/layout/DailyStreak';
import { getTranslation } from '@/lib/i18n';
import { getPopularLandings, landingTitle } from '@/lib/seoLandings';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';

interface FooterProps {
  locale: string;
}

export default function Footer({ locale }: FooterProps) {
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';
  const popularLandings = getPopularLandings();

  return (
    <footer className="border-t border-divider bg-bg-base/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wind className="w-6 h-6 text-data-waves" />
              <span className="text-lg font-bold text-fg">Ven<span className="text-data-waves">Tu</span></span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              {isPt 
                ? `Plataforma open-source para desportos náuticos em Portugal. Previsões ${pipelineSchedule('pt')}, observações IH/IPMA e notícias automáticas.`
                : `Open-source platform for water sports in Portugal. Forecasts ${pipelineSchedule('en')}, IH/IPMA observations and automated news.`}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">
              {t.footer.links}
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://github.com/braindeadpt/ventu" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors">
                  <Github className="w-4 h-4" />
                  GitHub ↗
                </a>
              </li>
              <li>
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors">
                  <ExternalLink className="w-4 h-4" />
                  Open-Meteo ↗
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">
              {isPt ? 'Explorar' : 'Explore'}
            </h4>
            <ul className="space-y-2">
              {popularLandings.map((landing) => (
                <li key={landing.slug}>
                  <Link
                    href={`/${locale}/explorar/${landing.slug}/`}
                    className="text-sm text-fg-muted hover:text-fg transition-colors"
                  >
                    {landingTitle(landing, locale)}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/${locale}/explorar/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Ver todas as combinações →' : 'View all combinations →'}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/livecams/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Livecams →' : 'Live cams →'}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/spots/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Todos os spots →' : 'All spots →'}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">
              {isPt ? 'Recursos' : 'Resources'}
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href={`/${locale}/news/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {t.nav.news}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/sazonalidade/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {t.nav.sazonalidade}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/compare/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {t.nav.comparar}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/ferramentas/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Ferramentas' : 'Tools'}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/favorites/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Favoritos' : 'Favorites'}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/alerts/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {isPt ? 'Alertas' : 'Alerts'}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/about/`}
                  className="text-sm text-fg-muted hover:text-fg transition-colors"
                >
                  {t.nav.about}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">
              {t.footer.data}
            </h4>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li>{isPt ? 'Ondas: Open-Meteo Marine' : 'Waves: Open-Meteo Marine'}</li>
              <li>{isPt ? 'Vento: ECMWF / GFS' : 'Wind: ECMWF / GFS'}</li>
              <li>
                {isPt ? (
                  <>
                    Observações:{' '}
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
                  </>
                ) : (
                  <>
                    Observations:{' '}
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
                  </>
                )}
              </li>
              <li>{isPt ? 'Notícias: Gemini Flash' : 'News: Gemini Flash'}</li>
            </ul>
          </div>
        </div>

        <p className="mt-8 text-xs text-fg-subtle leading-relaxed max-w-3xl">
          {isPt ? (
            <>
              Imagery © Esri, Maxar, Earthstar Geographics (vistas aéreas dos spots). Fotos de região:{' '}
              <a href="https://unsplash.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
                Unsplash
              </a>
              {' / '}
              <a href="https://www.pexels.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
                Pexels
              </a>
              . Ver{' '}
              <Link href={`/${locale}/about/`} className="underline hover:text-fg-muted">
                Sobre
              </Link>{' '}
              e <code className="text-meta-sm">public/images/CREDITS.md</code>.
            </>
          ) : (
            <>
              Imagery © Esri, Maxar, Earthstar Geographics (spot aerials). Region photos:{' '}
              <a href="https://unsplash.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
                Unsplash
              </a>
              {' / '}
              <a href="https://www.pexels.com" className="underline hover:text-fg-muted" target="_blank" rel="noopener noreferrer">
                Pexels
              </a>
              . See{' '}
              <Link href={`/${locale}/about/`} className="underline hover:text-fg-muted">
                About
              </Link>{' '}
              and <code className="text-meta-sm">public/images/CREDITS.md</code>.
            </>
          )}
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