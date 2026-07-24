'use client';

import { useMemo, useState } from 'react';
import type { DirectoryEntry, DirectoryKind } from '@/types/directory';
import { DIRECTORY_KIND_LABELS } from '@/lib/directory';
import DirectoryEntryCard from '@/components/directory/DirectoryEntryCard';
import FilterPill from '@/components/ui/FilterPill';
import EmptyState from '@/components/ui/EmptyState';
import { GraduationCap } from 'lucide-react';

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

export default function DirectoryClient({ locale, entries, generatedAt }: Props) {
  const isPt = locale === 'pt';
  const [kind, setKind] = useState<DirectoryKind | 'all'>('all');
  const [q, setQ] = useState('');

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const r = isPt ? e.region : e.regionEn || e.region;
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [entries, isPt, locale]);

  const [region, setRegion] = useState<string>('all');

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
          {isPt ? 'Directório' : 'Directory'}
        </h1>
        <p className="text-body text-fg-muted">
          {isPt
            ? 'Escolas, kite centers e lojas em Portugal — seed OpenStreetMap + curado. Grátis para riders; escolas podem reclamar o perfil.'
            : 'Schools, kite centers and shops in Portugal — OpenStreetMap seed + curated. Free for riders; businesses can claim their profile.'}
        </p>
        {generatedAt && (
          <p className="text-meta-sm text-fg-subtle font-mono">
            {entries.length} · {new Date(generatedAt).toLocaleString(locale)}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <label className="block max-w-md">
          <span className="sr-only">{isPt ? 'Pesquisar' : 'Search'}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isPt ? 'Pesquisar nome ou zona…' : 'Search name or area…'}
            className="w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          />
        </label>

        <div
          className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x pb-0.5"
          role="group"
          aria-label={isPt ? 'Tipo' : 'Type'}
        >
          {KINDS.map((k) => {
            const label =
              k === 'all'
                ? isPt
                  ? 'Todos'
                  : 'All'
                : isPt
                  ? DIRECTORY_KIND_LABELS[k].pt
                  : DIRECTORY_KIND_LABELS[k].en;
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
            aria-label={isPt ? 'Região' : 'Region'}
          >
            <FilterPill active={region === 'all'} onClick={() => setRegion('all')}>
              {isPt ? 'Todas as regiões' : 'All regions'}
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
          title={isPt ? 'Nada encontrado' : 'Nothing found'}
          description={
            isPt
              ? 'Ajusta filtros ou corre o seed OSM (directory:fetch).'
              : 'Adjust filters or run the OSM seed (directory:fetch).'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <DirectoryEntryCard key={e.id} entry={e} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
