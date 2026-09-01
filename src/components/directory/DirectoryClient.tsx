'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { DirectoryEntry, DirectoryKind } from '@/types/directory';
import { DIRECTORY_KIND_LABELS } from '@/lib/directoryClient';
import DirectoryEntryCard from '@/components/directory/DirectoryEntryCard';
import DirectoryRegisterForm from '@/components/directory/DirectoryRegisterForm';
import FilterPill from '@/components/ui/FilterPill';
import EmptyState from '@/components/ui/EmptyState';
import { GraduationCap, List, Map as MapIcon } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';
import {
  fetchDirectoryListings,
  fetchDirectoryProfiles,
  applyDirectoryProfiles,
  mergeDirectoryEntries,
  type DirectoryProfileOverlay,
} from '@/lib/directoryListings';

const DirectoryMap = dynamic(() => import('@/components/directory/DirectoryMap'), {
  ssr: false,
  loading: () => (
    <div
      className="h-[clamp(220px,36vh,360px)] rounded-2xl border border-divider bg-bg-base animate-pulse"
      aria-hidden
    />
  ),
});

type Props = {
  locale: string;
  entries: DirectoryEntry[];
  generatedAt?: string;
};

const KINDS: Array<DirectoryKind | 'all'> = [
  'all',
  'surf_school',
  'kite_center',
  'shop',
  'windsurf',
  'club',
  'rental',
  'other',
];

export default function DirectoryClient({ locale, entries: seedEntries, generatedAt }: Props) {
  const isPt = locale === 'pt';
  const nav = getTranslation(isPt ? 'pt' : 'en').nav;
  const d = getTranslation(isPt ? 'pt' : 'en').directory;
  const [live, setLive] = useState<DirectoryEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, DirectoryProfileOverlay>>(new Map());
  const [kind, setKind] = useState<DirectoryKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [view, setView] = useState<'list' | 'map'>('list');

  const reloadLive = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      const [listings, nextProfiles] = await Promise.all([
        fetchDirectoryListings(sb),
        fetchDirectoryProfiles(sb),
      ]);
      setProfiles(nextProfiles);
      setLive(listings);
    } catch {
      /* table missing / offline */
    }
  }, []);

  useEffect(() => {
    void reloadLive();
  }, [reloadLive]);

  const entries = useMemo(() => {
    const merged = mergeDirectoryEntries(seedEntries, live);
    return applyDirectoryProfiles(merged, profiles);
  }, [seedEntries, live, profiles]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const r = isPt ? e.region : e.regionEn || e.region;
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [entries, isPt, locale]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false;
      const r = isPt ? e.region : e.regionEn || e.region;
      if (region !== 'all' && r !== region) return false;
      if (!query) return true;
      const blob = `${e.name} ${e.nameEn || ''} ${e.address || ''} ${e.region || ''}`.toLowerCase();
      return blob.includes(query);
    });
  }, [entries, kind, region, q, isPt]);

  return (
    <div className="space-y-6">
      <header className="space-y-2 max-w-2xl">
        <h1 className="font-display text-display text-fg">
          {d.title}
        </h1>
        <p className="text-body text-fg-muted">
          {d.intro}
        </p>
        <p className="text-meta-sm text-fg-subtle font-mono">
          {entries.length}
          {generatedAt ? ` · seed ${new Date(generatedAt).toLocaleString(locale)}` : ''}
          {live.length ? ` · +${live.length} ${d.submittedCount}` : ''}
        </p>
        <a
          href="#registar-escola"
          className="inline-flex text-meta-sm font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
        >
          {d.registerCta}
        </a>
        {' · '}
        <a
          href={`/${locale}/diretorio/gerir/`}
          className="inline-flex text-meta-sm font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
        >
          {d.manageProfileCta}
        </a>
      </header>

      <div className="flex flex-col gap-3">
        <label className="block max-w-md">
          <span className="sr-only">{d.searchLabel}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={d.searchPlaceholder}
            className="w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          />
        </label>

        <div
          className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x pb-0.5"
          role="group"
          aria-label={d.viewAria}
        >
          <FilterPill active={view === 'list'} onClick={() => setView('list')}>
            <span className="inline-flex items-center gap-1.5">
              <List className="w-3.5 h-3.5" aria-hidden />
              {d.listView}
            </span>
          </FilterPill>
          <FilterPill active={view === 'map'} onClick={() => setView('map')}>
            <span className="inline-flex items-center gap-1.5">
              <MapIcon className="w-3.5 h-3.5" aria-hidden />
              {nav.mapa}
            </span>
          </FilterPill>
        </div>

        <div
          className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x pb-0.5"
          role="group"
          aria-label={d.typeAria}
        >
          {KINDS.map((k) => {
            const label =
              k === 'all'
                ? d.all
                : DIRECTORY_KIND_LABELS[k][isPt ? 'pt' : 'en'];
            return (
              <FilterPill key={k} active={kind === k} onClick={() => setKind(k)}>
                {label}
              </FilterPill>
            );
          })}
        </div>

        {regions.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x pb-0.5"
            role="group"
            aria-label={d.regionAria}
          >
            <FilterPill active={region === 'all'} onClick={() => setRegion('all')}>
              {d.allRegions}
            </FilterPill>
            {regions.map((r) => (
              <FilterPill key={r} active={region === r} onClick={() => setRegion(r)}>
                {r}
              </FilterPill>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="w-7 h-7 text-fg-muted" aria-hidden />}
          title={d.nothingFound}
          description={d.nothingFoundDescription}
        />
      ) : view === 'map' ? (
        <div className="space-y-3">
          <DirectoryMap entries={filtered} locale={locale} />
          <p className="text-meta-sm text-fg-subtle">
            {d.mapHint}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <DirectoryEntryCard
              key={e.id}
              entry={e}
              locale={locale}
              showClaim={e.source !== 'submitted'}
            />
          ))}
        </div>
      )}

      <DirectoryRegisterForm locale={locale} onCreated={() => void reloadLive()} />
    </div>
  );
}
