'use client';

import Link from 'next/link';
import { ExternalLink, Video } from 'lucide-react';
import { getSpotLivecam } from '@/lib/spotLivecams';
import { getTranslation } from '@/lib/i18n';

interface SpotLivecamLinkProps {
  slug: string;
  locale: string;
}

export default function SpotLivecamLink({ slug, locale }: SpotLivecamLinkProps) {
  const cam = getSpotLivecam(slug);
  if (!cam) return null;

  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const title = isPt ? cam.labelPt : cam.labelEn;

  const isYoutube = cam.kind === 'youtube' && cam.youtubeId;
  const isSurfline = cam.kind === 'surfline' && cam.embedUrl;
  const hasEmbed = isYoutube || isSurfline;
  const embedSrc = isYoutube
    ? `https://www.youtube-nocookie.com/embed/${cam.youtubeId}?rel=0&playsinline=1`
    : cam.embedUrl;

  return (
    <div className="card-1 p-4 md:p-5">
      {hasEmbed && embedSrc && (
        <div className="aspect-video w-full rounded-lg overflow-hidden border border-divider mb-4 bg-surface-1/[0.04]">
          <iframe
            src={embedSrc}
            title={title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="rounded-card bg-data-waves/10 p-2.5 text-data-waves shrink-0">
            <Video className="w-5 h-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-h3 text-fg">{title}</p>
            <p className="text-sm text-fg-muted mt-1">
              {isYoutube
                ? t.layout.livecamYoutube
                : isSurfline
                  ? t.layout.livecamSurfline
                  : t.layout.livecamGeneric.replace('{provider}', cam.provider)}
            </p>
          </div>
        </div>

        <a
          href={cam.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-data-waves text-bg-base hover:bg-data-waves/90 transition-colors min-h-[44px] shrink-0"
        >
          {t.livecams.watchLive}
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      </div>

      <p className="text-meta-sm text-fg-subtle mt-4 pt-3 border-t border-divider">
        <Link href={`/${locale}/livecams/`} className="text-data-waves hover:underline">
          {t.layout.weatherLivecamsBrowse}
        </Link>
      </p>
    </div>
  );
}
