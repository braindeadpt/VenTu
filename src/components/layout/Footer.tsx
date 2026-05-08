'use client';

import { Wind, Github, Heart, ExternalLink } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

interface FooterProps {
  locale: string;
}

export default function Footer({ locale }: FooterProps) {
  const t = getTranslation(locale as any);
  const isPt = locale === 'pt';

  return (
    <footer className="border-t border-white/10 bg-ocean-950/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wind className="w-6 h-6 text-ocean-400" />
              <span className="text-lg font-bold text-gradient">WindSpot</span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              {isPt 
                ? 'Plataforma open-source para desportos náuticos em Portugal. Dados em tempo real, previsões e notícias automáticas.'
                : 'Open-source platform for water sports in Portugal. Real-time data, forecasts and automated news.'}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
              {t.footer.links}
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://github.com/braindeadpt/windspot-pt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/50 hover:text-ocean-400 transition-colors">
                  <Github className="w-4 h-4" />
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/50 hover:text-ocean-400 transition-colors">
                  <ExternalLink className="w-4 h-4" />
                  Open-Meteo
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
              {t.footer.data}
            </h4>
            <ul className="space-y-2 text-sm text-white/50">
              <li>{isPt ? 'Ondas: Open-Meteo Marine' : 'Waves: Open-Meteo Marine'}</li>
              <li>{isPt ? 'Vento: ECMWF / GFS' : 'Wind: ECMWF / GFS'}</li>
              <li>{isPt ? 'Notícias: Gemini Flash' : 'News: Gemini Flash'}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            © 2026 WindSpot Portugal. MIT License. Open Source Project.
          </p>
          <p className="flex items-center gap-1 text-xs text-white/30">
            {t.footer.madeWith} <Heart className="w-3 h-3 text-red-400" /> {t.footer.forCommunity}
          </p>
        </div>
      </div>
    </footer>
  );
}