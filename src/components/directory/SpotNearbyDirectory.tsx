'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DirectoryEntry, DirectoryFile } from '@/types/directory';
import { entriesNearSpot } from '@/lib/directoryClient';
import {
  applyDirectoryProfiles,
  fetchDirectoryListings,
  fetchDirectoryProfiles,
  mergeDirectoryEntries,
} from '@/lib/directoryListings';
import { getSupabaseClient } from '@/lib/supabase';
import DirectoryEntryCard from '@/components/directory/DirectoryEntryCard';
import { sortDirectoryEntries } from '@/lib/directoryClient';
import { getTranslation } from '@/lib/i18n';

type Props = {
  spotId: string;
  spotLat: number;
  spotLon: number;
  locale: string;
  /** Dentro de um card/rail: grelha a uma coluna e cabeçalho compacto. */
  embedded?: boolean;
};

type Nearby = DirectoryEntry & { distanceKm: number };

export default function SpotNearbyDirectory({ spotId, spotLat, spotLon, locale, embedded }: Props) {
  const d = getTranslation(locale).directory;
  const [nearby, setNearby] = useState<Nearby[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let seed: DirectoryEntry[] = [];
      try {
        const r = await fetch('/data/directory.json');
        if (r.ok) {
          const file = (await r.json()) as DirectoryFile;
          seed = file.entries || [];
        }
      } catch {
        /* ignore */
      }
      let live: DirectoryEntry[] = [];
      let profiles = new Map<string, import('@/lib/directoryListings').DirectoryProfileOverlay>();
      try {
        const sb = getSupabaseClient();
        if (sb) {
          ;[live, profiles] = await Promise.all([
            fetchDirectoryListings(sb),
            fetchDirectoryProfiles(sb),
          ]);
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const merged = applyDirectoryProfiles(mergeDirectoryEntries(seed, live), profiles);
      const near = entriesNearSpot(merged, spotId, spotLat, spotLon, {
        maxKm: 12,
        limit: 24,
      });
      const dist = new Map(near.map((n) => [n.id, n.distanceKm]));
      setNearby(
        sortDirectoryEntries(near)
          .slice(0, 6)
          .map((e) => ({ ...e, distanceKm: dist.get(e.id) ?? 0 })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [spotId, spotLat, spotLon]);

  if (nearby.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="spot-nearby-directory">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="spot-nearby-directory"
            className={embedded ? 'text-h3 text-fg' : 'font-display text-h2 text-fg'}
          >
            {d.nearbySchoolsTitle}
          </h2>
          {!embedded && <p className="text-body text-fg-muted mt-1">{d.nearbyNote}</p>}
        </div>
        <Link
          href={`/${locale}/diretorio/`}
          className="text-meta-sm font-semibold text-fg-muted hover:text-fg shrink-0"
        >
          {d.directoryArrow}
        </Link>
      </div>
      {/* grid-cols-1 explícito (minmax(0,1fr)) — sem ele a coluna implícita
          auto dimensiona-se a max-content (nome com truncate/nowrap) e
          transborda do rail em vez de cortar. */}
      <div className={embedded ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
        {nearby.map((e) => (
          <DirectoryEntryCard
            key={e.id}
            entry={e}
            locale={locale}
            distanceKm={e.distanceKm}
            compact
          />
        ))}
      </div>
    </section>
  );
}
