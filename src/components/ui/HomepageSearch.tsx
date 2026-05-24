'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MapPin, Wind, Waves, Zap } from 'lucide-react';
import type { Spot } from '@/types';
import { searchSpots as filterSpots } from '@/lib/spotSearch';
import { getTranslation } from '@/lib/i18n';
import Input from '@/components/ui/Input';

interface HomepageSearchProps {
  locale: string;
}

const getSportIcon = (type: Spot['type']) => {
  switch (type) {
    case 'kitesurf':
    case 'foil':
      return Zap;
    case 'windsurf':
      return Wind;
    case 'surf':
    case 'big-wave':
      return Waves;
    default:
      return Waves;
  }
};

export default function HomepageSearch({ locale }: HomepageSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');

  const searchSpots = (searchQuery: string) => {
    setResults(filterSpots({ locale, query: searchQuery, limit: 8 }));
    setSelectedIndex(0);
  };

  const handleOpen = () => {
    searchSpots('');
    setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      router.push(`/${locale}/spots/${results[selectedIndex].slug}/`);
      handleClose();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const handleSelect = (spot: Spot) => {
    router.push(`/${locale}/spots/${spot.slug}/`);
    handleClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-surface-1 border border-divider hover:border-divider-strong rounded-lg text-fg-subtle transition-colors"
      >
        <Search className="w-4 h-4 text-fg-muted" aria-hidden />
        <span>{isPt ? 'Procurar spot...' : 'Search spot...'}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-bg-base/80 backdrop-blur-sm"
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-label={t.nav.search}
        >
          <div
            ref={dialogRef}
            className="relative w-full max-w-xl mx-4 bg-surface-1 border border-divider rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 p-4 border-b border-divider">
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); searchSpots(e.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder={isPt ? 'Pesquisar spots, regiões...' : 'Search spots, regions...'}
                icon={<Search className="w-5 h-5" />}
                wrapperClassName="flex-1"
                className="text-lg border-0 bg-transparent focus:ring-0 pl-9"
                aria-label={t.nav.search}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-surface-2 shrink-0"
                aria-label={t.common.close}
              >
                <X className="w-5 h-5 text-fg-subtle" aria-hidden />
              </button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="p-4 text-center text-fg-subtle">
                  {isPt ? 'Nenhum resultado encontrado' : 'No results found'}
                </p>
              ) : (
                <div className="space-y-1">
                  {results.map((spot, index) => {
                    const Icon = getSportIcon(spot.type);
                    const name = isPt ? spot.name : spot.nameEn;
                    const region = isPt ? spot.region : spot.regionEn;

                    return (
                      <button
                        key={spot.id}
                        onClick={() => handleSelect(spot)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                          index === selectedIndex
                            ? 'bg-data-waves/10 text-fg'
                            : 'hover:bg-surface-2 text-fg-subtle'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-data-waves" aria-hidden />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-sm text-fg-subtle flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden />{region}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-divider flex items-center justify-between text-xs text-fg-subtle">
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-divider">↑↓</kbd>
                <span>{isPt ? 'Navegar' : 'Navigate'}</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-divider">↵</kbd>
                <span>{isPt ? 'Selecionar' : 'Select'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
