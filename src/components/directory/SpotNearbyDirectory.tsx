'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DirectoryEntry, DirectoryFile } from '@/types/directory';
import { entriesNearSpot } from '@/lib/directory';
import { fetchDirectoryListings, mergeDirectoryEntries } from '@/lib/directoryListings';
import { getSupabaseClient } from '@/lib/supabase';
import DirectoryEntryCard from '@/components/directory/DirectoryEntryCard';

type Props = {
  spotId: string;
  spotLat: number;
  spotLon: number;
  locale: string;
};

type Nearby = DirectoryEntry & { distanceKm: number };

export default function SpotNearbyDirectory({ spotId, spotLat, spotLon, locale }: Props) {
  const isPt = locale === 'pt';
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
      try {
        const sb = getSupabaseClient();
        if (sb) live = await fetchDirectoryListings(sb);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const merged = mergeDirectoryEntries(seed, live);
      setNearby(
        entriesNearSpot(merged, spotId, spotLat, spotLon, {
          maxKm: 12,
          limit: 6,
        }),
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
          <h2 id="spot-nearby-directory" className="font-display text-h2 text-fg">
            {isPt ? 'Escolas e lojas perto' : 'Nearby schools & shops'}
          </h2>
          <p className="text-body text-fg-muted mt-1">
            {isPt
              ? 'Dados públicos — ainda podem estar por verificar. És a escola? Reclama ou regista em Directório.'
              : 'Public data — may be unverified. Own the school? Claim or register in Directory.'}
          </p>
        </div>
        <Link
          href={`/${locale}/diretorio/`}
          className="text-meta-sm font-semibold text-fg-muted hover:text-fg shrink-0"
        >
          {isPt ? 'Directório →' : 'Directory →'}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
