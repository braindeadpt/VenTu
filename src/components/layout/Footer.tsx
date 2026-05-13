'use client';

import { Wind, Github, Heart, ExternalLink, Shield } from 'lucide-react';
import FeedbackForm from '@/components/FeedbackForm';
import { getTranslation } from '@/lib/i18n';

interface FooterProps {
  locale: string;
}

export default function Footer({ locale }: FooterProps) {
  const t = getTranslation(locale as any);
  const isPt = locale === 'pt';

  return (
    <footer className="border-t border-divider bg-bg-base/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wind className="w-6 h-6 text-data-waves" />
              <span className="text-lg font-bold text-fg">Ven<span className="text-data-waves">Tu</span></span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              {isPt 
                ? 'Plataforma open-source para desportos náuticos em Portugal. Dados em tempo real, previsões e notícias automáticas.'
                : 'Open-source platform for water sports in Portugal. Real-time data, forecasts and automated news.'}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">
              {t.footer.links}
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://github.com/braindeadpt/ventu" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-fg-muted hover:text-data-waves transition-colors">
                  <Github className="w-4 h-4" />
                  GitHub ↗
                </a>
              </li>
              <li>
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-fg-muted hover:text-data-waves transition-colors">
                  <ExternalLink className="w-4 h-4" />
                  Open-Meteo ↗
                </a>
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
              <li>{isPt ? 'Notícias: Gemini Flash' : 'News: Gemini Flash'}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-divider flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-xs text-fg-subtle">
              © {new Date().getFullYear()} VenTu. MIT License. Open Source Project.
            </p>
            <FeedbackForm locale={locale} />
          </div>
          <div className="flex items-center gap-4">
            <a
              href={`/${locale}/admin/contributions`}
              className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg transition-colors"
            >
              <Shield className="w-3 h-3" />
              Admin
            </a>
            <p className="flex items-center gap-1 text-xs text-fg-subtle">
              {t.footer.madeWith} <Heart className="w-3 h-3 text-windDir-onshore" /> {t.footer.forCommunity}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}