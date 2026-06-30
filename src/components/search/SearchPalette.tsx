'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Waves, MapPin, Newspaper, Tag } from 'lucide-react';
import type { NewsItem } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { newsSlug } from '@/lib/news';
import { getAssetPath } from '@/lib/paths';
import { getMacroRegion } from '@/lib/regions';

interface SpotLite {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  regionEn: string;
}

interface SearchPaletteProps {
  locale: string;
  onClose: () => void;
}

interface SearchResult {
  type: 'spot' | 'regiao' | 'modalidade' | 'noticia';
  label: string;
  labelEn: string;
  meta: string;
  href: string;
  icon: typeof Waves;
}

const MODALIDADES = [
  { slug: 'surf', label: 'Surf' },
  { slug: 'kitesurf', label: 'Kitesurf' },
  { slug: 'windsurf', label: 'Windsurf' },
  { slug: 'big-wave', label: 'Big Wave' },
  { slug: 'sup', label: 'SUP' },
  { slug: 'foil', label: 'Foil' },
];

// Deduplicate regions preserving order
function getUniqueRegions(spotsList: SpotLite[]): { slug: string; name: string; nameEn: string }[] {
  const seen = new Set<string>();
  return spotsList.reduce<{ slug: string; name: string; nameEn: string }[]>((acc, s) => {
    const key = s.region.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      acc.push({ slug: s.region.toLowerCase().replace(/\s+/g, '-'), name: s.region, nameEn: s.regionEn });
    }
    return acc;
  }, []);
}

export default function SearchPalette({ locale, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';

  const regions = useMemo(() => getUniqueRegions(spotsCache), [spotsCache]);

  // Load spots index once
  const [spotsCache, setSpotsCache] = useState<SpotLite[]>([]);
  useEffect(() => {
    fetch(getAssetPath('/data/spots-lite.json'))
      .then((r) => r.json())
      .then((data) => setSpotsCache(Array.isArray(data) ? data : []))
      .catch(() => setSpotsCache([]));
  }, []);

  // Load news once
  const [newsCache, setNewsCache] = useState<NewsItem[]>([]);
  useEffect(() => {
    fetch(getAssetPath('/data/news.json'))
      .then((r) => r.json())
      .then((data) => setNewsCache(Array.isArray(data) ? data : []))
      .catch(() => setNewsCache([]));
  }, []);

  // Filter logic
  useEffect(() => {
    if (!query.trim()) {
      setAllResults([]);
      setSelectedIndex(0);
      return;
    }

    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const results: SearchResult[] = [];

    // Spots
    spotsCache.forEach((spot) => {
      const name = isPt ? spot.name : spot.nameEn;
      const searchName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (searchName.includes(q)) {
        results.push({
          type: 'spot',
          label: name,
          labelEn: spot.name,
          meta: isPt ? spot.region : spot.regionEn,
          href: `/${locale}/spots/${spot.slug}/`,
          icon: Waves,
        });
      }
    });

    // Regions → homepage macro-region filter (?region=Norte, etc.)
    regions.forEach((r) => {
      const name = isPt ? r.name : r.nameEn;
      const macro = getMacroRegion(r.name);
      if (!macro) return;
      const searchName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (searchName.includes(q)) {
        results.push({
          type: 'regiao',
          label: name,
          labelEn: r.name,
          meta: macro,
          href: `/${locale}/?region=${encodeURIComponent(macro)}`,
          icon: MapPin,
        });
      }
    });

    // Modalities
    MODALIDADES.forEach((m) => {
      if (m.label.toLowerCase().includes(q)) {
        results.push({
          type: 'modalidade',
          label: m.label,
          labelEn: m.label,
          meta: '',
          href: `/${locale}/explorar/${m.slug}/`,
          icon: Tag,
        });
      }
    });

    // News
    newsCache.forEach((n) => {
      const title = isPt ? n.title : n.titleEn;
      if (title.toLowerCase().includes(q)) {
        results.push({
          type: 'noticia',
          label: title,
          labelEn: n.title,
          meta: n.source,
          href: `/${locale}/news/${newsSlug(n)}`,
          icon: Newspaper,
        });
      }
    });

    setAllResults(results.slice(0, 12));
    setSelectedIndex(0);
  }, [query, locale, isPt, regions, newsCache]);

  const getTabbable = useCallback(() => {
    if (!resultsRef.current) return [];
    const anchors = resultsRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    return Array.from(anchors);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const tabbable = getTabbable();
        if (tabbable.length === 0) return;
        const current = document.activeElement;
        const currentIdx = tabbable.indexOf(current as HTMLElement);
        if (e.shiftKey) {
          if (currentIdx <= 0) {
            e.preventDefault();
            tabbable[tabbable.length - 1].focus();
          }
        } else {
          if (currentIdx === tabbable.length - 1 || currentIdx === -1) {
            e.preventDefault();
            tabbable[0].focus();
          }
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && allResults[selectedIndex]) {
        router.push(allResults[selectedIndex].href);
        return;
      }
    },
    [allResults, selectedIndex, onClose, router, getTabbable],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Auto-focus input and close on Escape global
  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const groupedResults = useMemo(() => {
    const groups: { type: SearchResult['type']; items: SearchResult[] }[] = [];
    const seen = new Set<SearchResult['type']>();
    allResults.forEach((r) => {
      if (!seen.has(r.type)) {
        seen.add(r.type);
        groups.push({ type: r.type, items: [] });
      }
      const group = groups.find((g) => g.type === r.type);
      group?.items.push(r);
    });
    return groups;
  }, [allResults]);

  const typeLabel = (type: SearchResult['type']): string => {
    const map: Record<SearchResult['type'], string> = {
      spot: isPt ? 'SPOTS' : 'SPOTS',
      regiao: isPt ? 'REGIÕES' : 'REGIONS',
      modalidade: isPt ? 'MODALIDADES' : 'MODALITIES',
      noticia: isPt ? 'NOTÍCIAS' : 'NEWS',
    };
    return map[type];
  };

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={t.nav.search}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-modal border border-divider bg-bg-elevated shadow-modal overflow-hidden"
        ref={resultsRef}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
          <Search className="w-5 h-5 text-fg-subtle shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.nav.searchPlaceholder}
            className="flex-1 bg-transparent text-body text-fg placeholder-fg-subtle outline-none"
            aria-label={t.nav.search}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-colors"
              aria-label={t.nav.searchClear}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results */}
        {allResults.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto py-2">
            {groupedResults.map((group) => (
              <div key={group.type}>
                <div className="px-4 py-1.5 text-xs font-medium text-fg-subtle uppercase tracking-wider">
                  {typeLabel(group.type)}
                </div>
                {group.items.map((item, idx) => {
                  const globalIdx = allResults.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${item.type}-${item.label}`}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        globalIdx === selectedIndex
                          ? 'bg-surface-2/[0.08] text-fg'
                          : 'text-fg-muted hover:bg-surface-1/[0.04] hover:text-fg'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-data-waves" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {item.label}
                        </div>
                        {item.meta && (
                          <div className="text-xs text-fg-subtle truncate">{item.meta}</div>
                        )}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 text-fg-subtle" />
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Empty / no results */}
        {query && allResults.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-fg-subtle">
            {t.nav.searchNoResults.replace('{query}', query)}
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-divider bg-surface-1/[0.04]">
          <span className="text-xs text-fg-subtle">
            <kbd className="px-1 py-0.5 rounded bg-surface-2/[0.08] text-fg-muted font-mono text-xs">↑↓</kbd>
            {' '}{isPt ? 'navegar' : 'navigate'}
          </span>
          <span className="text-xs text-fg-subtle">
            <kbd className="px-1 py-0.5 rounded bg-surface-2/[0.08] text-fg-muted font-mono text-xs">⏎</kbd>
            {' '}{isPt ? 'abrir' : 'open'}
          </span>
          <span className="text-xs text-fg-subtle">
            <kbd className="px-1 py-0.5 rounded bg-surface-2/[0.08] text-fg-muted font-mono text-xs">Esc</kbd>
            {' '}{isPt ? 'fechar' : 'close'}
          </span>
        </div>
      </div>
    </div>
  );
}
