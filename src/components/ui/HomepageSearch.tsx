'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MapPin, Wind, Waves, Zap } from 'lucide-react';
import type { Spot } from '@/types';
import { searchSpots as filterSpots } from '@/lib/spotSearch';

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
  const router = useRouter();
  const isPt = locale === 'pt';

  const searchSpots = (searchQuery: string) => {
    setResults(filterSpots({ locale, query: searchQuery, limit: 8 }));
    setSelectedIndex(0);
  };

  const handleOpen = () => {
    searchSpots('');
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

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

  return (
    <>
      {/* Search Button */}
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-surface-1 border border-divider hover:border-divider-strong rounded-lg text-fg-subtle transition-colors"
      >
        <Search className="w-4 h-4 text-fg-muted" />
        <span>{isPt ? 'Procurar spot...' : 'Search spot...'}</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
          <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm" onClick={handleClose} />
          
          <div className="relative w-full max-w-xl mx-4 bg-surface-1 border border-divider rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-divider">
              <Search className="w-5 h-5 text-fg-subtle" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); searchSpots(e.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder={isPt ? 'Pesquisar spots, regiões...' : 'Search spots, regions...'}
                className="flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none text-lg"
                autoFocus
              />
              <button onClick={handleClose} className="p-1 rounded hover:bg-surface-2">
                <X className="w-5 h-5 text-fg-subtle" />
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
                          <Icon className="w-5 h-5 text-data-waves" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-sm text-fg-subtle flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{region}
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