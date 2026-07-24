'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DirectoryEntry } from '@/types/directory';
import { kindLabel, sportLabel } from '@/lib/directoryClient';
import {
  applyDirectoryProfiles,
  fetchDirectoryListings,
  fetchDirectoryProfiles,
  mergeDirectoryEntries,
} from '@/lib/directoryListings';
import { getSupabaseClient } from '@/lib/supabase';
import { spots } from '@/lib/spots';
import DirectoryClaimButton from '@/components/directory/DirectoryClaimButton';
import Card from '@/components/ui/Card';
import { safeExternalUrl, safeTelHref } from '@/lib/safeUrl';

type Props = {
  locale: string;
  entry: DirectoryEntry;
};

export default function DirectoryDetailClient({ locale, entry: seed }: Props) {
  const isPt = locale === 'pt';
  const [entry, setEntry] = useState(seed);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseClient();
      if (!sb) return;
      try {
        const [live, profiles] = await Promise.all([
          fetchDirectoryListings(sb),
          fetchDirectoryProfiles(sb),
        ]);
        if (cancelled) return;
        const merged = applyDirectoryProfiles(mergeDirectoryEntries([seed], live), profiles);
        const next = merged.find((e) => e.id === seed.id || e.slug === seed.slug) || seed;
        setEntry(next);
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

  const name = isPt ? entry.name : entry.nameEn || entry.name;
  const nearbySpots = entry.spotIds
    .map((id) => spots.find((s) => s.id === id))
    .filter(Boolean);
  const websiteHref = safeExternalUrl(entry.website);
  const telHref = safeTelHref(entry.phone);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-6">
      <nav className="text-meta-sm text-fg-muted">
        <Link href={`/${locale}/diretorio/`} className="hover:text-fg">
          {isPt ? 'Directório' : 'Directory'}
        </Link>
        <span className="mx-1.5" aria-hidden>
          /
        </span>
        <span className="text-fg">{name}</span>
      </nav>

      <header className="space-y-2">
        <p className="text-meta-sm text-fg-muted uppercase tracking-wide font-semibold">
          {kindLabel(entry.kind, locale)}
          {!entry.verified && (
            <span className="ml-2 font-normal normal-case text-fg-subtle">
              · {isPt ? 'Não verificado' : 'Unverified'}
            </span>
          )}
          {entry.verified && (
            <span className="ml-2 font-normal normal-case text-score-good">
              · {isPt ? 'Verificado' : 'Verified'}
            </span>
          )}
        </p>
        <h1 className="font-display text-display text-fg">{name}</h1>
        {(entry.region || entry.address) && (
          <p className="text-body text-fg-muted">
            {[isPt ? entry.region : entry.regionEn || entry.region, entry.address]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {entry.bio && <p className="text-body text-fg-muted">{entry.bio}</p>}
      </header>

      {entry.sports.length > 0 && (
        <p className="text-body text-fg-muted">
          {entry.sports.map((s) => sportLabel(s, locale)).join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-meta-sm">
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
          >
            Website ↗
          </a>
        )}
        {telHref && entry.phone && (
          <a href={telHref} className="font-semibold text-fg-muted hover:text-fg">
            {entry.phone}
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lon}#map=16/${entry.lat}/${entry.lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
        >
          OpenStreetMap ↗
        </a>
      </div>

      {nearbySpots.length > 0 && (
        <Card variant="card-1" className="space-y-2">
          <h2 className="text-h3 text-fg">{isPt ? 'Spots VenTu perto' : 'Nearby VenTu spots'}</h2>
          <ul className="space-y-1">
            {nearbySpots.map((s) =>
              s ? (
                <li key={s.id}>
                  <Link
                    href={`/${locale}/spots/${s.slug}/`}
                    className="text-body text-fg-muted hover:text-fg underline-offset-2 hover:underline"
                  >
                    {isPt ? s.name : s.nameEn}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </Card>
      )}

      <Card variant="card-2" className="space-y-3">
        <h2 className="font-display text-h2 text-fg">
          {isPt ? 'É a tua escola ou loja?' : 'Is this your school or shop?'}
        </h2>
        <p className="text-body text-fg-muted">
          {isPt
            ? 'Reclama o perfil para editar contactos e aparecer como verificado. Grátis para começar — premium B2B mais tarde (destaque, widget, etc.).'
            : 'Claim the profile to edit contacts and show as verified. Free to start — B2B premium later (featured, widget, etc.).'}
        </p>
        <DirectoryClaimButton entryId={entry.id} entryName={name} locale={locale} />
      </Card>

      <p className="text-meta-sm text-fg-subtle">
        {isPt
          ? `Fonte: ${entry.source === 'osm' ? 'OpenStreetMap' : entry.source}. Pode estar desactualizado.`
          : `Source: ${entry.source === 'osm' ? 'OpenStreetMap' : entry.source}. May be outdated.`}
      </p>
    </main>
  );
}
