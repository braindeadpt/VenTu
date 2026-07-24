'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DirectoryEntry, DirectoryFile } from '@/types/directory';
import { entriesNearSpot } from '@/lib/directory';
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
    void fetch('/data/directory.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((file: DirectoryFile | null) => {
        if (cancelled || !file?.entries) return;
        setNearby(
          entriesNearSpot(file.entries, spotId, spotLat, spotLon, {
            maxKm: 12,
            limit: 6,
          }),
        );
      })
      .catch(() => {
        /* offline / missing file */
      });
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
              ? 'Dados OSM / curados — ainda não verificados. És a escola? Reclama o perfil.'
              : 'OSM / curated data — unverified. Own the school? Claim the profile.'}
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
