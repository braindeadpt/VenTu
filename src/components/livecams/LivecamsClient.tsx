'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MonitorPlay, Video } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import type { getTranslation } from '@/lib/i18n';

export interface LivecamItem {
  slug: string;
  name: string;
  /** Região localizada para apresentar; `null` quando a cam não tem spot. */
  region: string | null;
  /** Chave canónica (PT) para agrupar no filtro. */
  regionKey: string | null;
  provider: string;
  url: string;
  /** youtube/surfline → vídeo embebido na página do spot; o resto abre no site do operador. */
  embedded: boolean;
  hasSpot: boolean;
}

interface Props {
  locale: string;
  items: LivecamItem[];
  t: ReturnType<typeof getTranslation>['livecams'];
}

export default function LivecamsClient({ locale, items, t }: Props) {
  const [region, setRegion] = useState<string | null>(null);

  const regions: { key: string; label: string }[] = [];
  for (const it of items) {
    if (it.regionKey && it.region && !regions.some((r) => r.key === it.regionKey)) {
      regions.push({ key: it.regionKey, label: it.region });
    }
  }

  const visible = region ? items.filter((it) => it.regionKey === region) : items;

  return (
    <div className="space-y-6">
      {regions.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.filterAll}>
          <FilterPill active={region === null} onClick={() => setRegion(null)}>
            {t.filterAll}
          </FilterPill>
          {regions.map((r) => (
            <FilterPill key={r.key} active={region === r.key} onClick={() => setRegion(r.key)}>
              {r.label}
            </FilterPill>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((cam) => (
          <article
            key={cam.slug}
            className="card-1 p-4 flex flex-col gap-3 hover:bg-surface-2/[0.04] transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-card bg-data-waves/10 p-2 text-data-waves shrink-0">
                <Video className="w-5 h-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-h3 text-fg truncate">{cam.name}</h2>
                {cam.region && (
                  <p className="text-meta text-fg-subtle truncate">{cam.region}</p>
                )}
                <p className="text-meta-sm text-fg-muted mt-1">
                  {t.provider}: {cam.provider}
                </p>
                <p className="inline-flex items-center gap-1 text-meta-sm text-fg-subtle mt-1">
                  {cam.embedded ? (
                    <><MonitorPlay className="w-3 h-3" aria-hidden />{t.kindEmbed}</>
                  ) : (
                    <><ExternalLink className="w-3 h-3" aria-hidden />{t.kindExternal}</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              <a
                href={cam.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-data-waves text-bg-base hover:bg-data-waves/80 transition-colors min-h-[44px]"
              >
                {t.watchLive}
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
              {cam.hasSpot && (
                <Link
                  href={`/${locale}/spots/${cam.slug}/`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-2/[0.08] text-fg border border-divider hover:bg-surface-3/[0.12] transition-colors min-h-[44px]"
                >
                  {t.viewSpot}
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
