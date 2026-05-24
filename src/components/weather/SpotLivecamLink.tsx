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

  return (
    <div className="card-1 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-card bg-accent/10 p-2 text-accent shrink-0">
          <Video className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 text-fg mb-1">
            {isPt ? 'Livecam' : 'Live cam'}
          </h3>
          <p className="text-sm text-muted mb-3">
            {isPt
              ? `${cam.labelPt} — ${cam.provider}. Abre numa nova janela.`
              : `${cam.labelEn} — ${cam.provider}. Opens in a new window.`}
          </p>
          <a
            href={cam.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            {isPt ? 'Ver livecam ao vivo' : 'Watch live cam'}
            <ExternalLink className="w-4 h-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
