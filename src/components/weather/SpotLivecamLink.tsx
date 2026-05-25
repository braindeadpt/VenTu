'use client';

import { ExternalLink, Video } from 'lucide-react';
import { getSpotLivecam } from '@/lib/spotLivecams';

interface SpotLivecamLinkProps {
  slug: string;
  locale: string;
}

export default function SpotLivecamLink({ slug, locale }: SpotLivecamLinkProps) {
  const cam = getSpotLivecam(slug);
  if (!cam) return null;

  const isPt = locale === 'pt';
  const title = isPt ? cam.labelPt : cam.labelEn;

  return (
    <div className="card-1 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-card bg-data-waves/10 p-2 text-data-waves shrink-0">
          <Video className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 text-fg mb-1">
            {isPt ? 'Livecam' : 'Live cam'}
          </h3>
          <p className="text-sm text-fg-muted mb-3">
            {isPt
              ? `${title} — ${cam.provider}.`
              : `${title} — ${cam.provider}.`}
            {cam.embedUrl
              ? isPt
                ? ' Player embebido abaixo; link externo como alternativa.'
                : ' Embedded player below; external link as fallback.'
              : isPt
                ? ' Abre numa nova janela.'
                : ' Opens in a new window.'}
          </p>

          {cam.embedUrl && (
            <div className="aspect-video rounded-card overflow-hidden bg-black mb-3 border border-divider">
              <iframe
                src={cam.embedUrl}
                className="w-full h-full"
                loading="lazy"
                allowFullScreen
                title={title}
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}

          <a
            href={cam.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-data-waves hover:underline"
          >
            {isPt ? 'Abrir no site do operador' : 'Open on provider site'}
            <ExternalLink className="w-4 h-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
