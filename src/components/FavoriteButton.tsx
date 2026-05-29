'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoritesFromStorage,
  writeFavoritesToStorage,
} from '@/lib/favoritesStorage';
import { useToast } from '@/components/ui/ToastProvider';

interface FavoriteButtonProps {
  spotId: string;
  spotName: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  locale?: string;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFavorites(readFavoritesFromStorage());
    setLoaded(true);

    const sync = () => setFavorites(readFavoritesFromStorage());
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggleFavorite = useCallback((spotId: string) => {
    setFavorites(prev => {
      const next = prev.includes(spotId)
        ? prev.filter(id => id !== spotId)
        : [...prev, spotId];
      writeFavoritesToStorage(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (spotId: string) => favorites.includes(spotId),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite, loaded, mounted, count: favorites.length };
}

export default function FavoriteButton({
  spotId,
  spotName,
  size = 'md',
  showLabel = false,
  locale = 'pt',
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite, loaded, mounted } = useFavorites();
  const { showToast } = useToast();
  const active = isFavorite(spotId);
  const isPt = locale === 'pt';
  const [clickEffect, setClickEffect] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (!mounted || !loaded) {
    return <div className={`${sizeClasses[size]} animate-pulse bg-surface-1/[0.04] rounded`} />;
  }

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasFavorite = active;
    toggleFavorite(spotId);
    if (!wasFavorite) {
      showToast(
        isPt ? 'Adicionado aos teus spots' : 'Added to your spots',
      );
    }
    setClickEffect(true);
    setTimeout(() => setClickEffect(false), 300);
  };

  const label = active
    ? isPt ? `Remover ${spotName} dos favoritos` : `Remove ${spotName} from favorites`
    : isPt ? `Adicionar ${spotName} aos favoritos` : `Add ${spotName} to favorites`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center min-w-[44px] min-h-[44px] p-2 rounded-lg transition-all hover:scale-110 ${
        clickEffect ? 'scale-125' : ''
      } ${
        active ? 'text-windDir-onshore' : 'text-fg-subtle hover:text-fg-muted'
      }`}
    >
      <Heart
        className={`${sizeClasses[size]} ${active ? 'fill-current' : ''}`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-sm font-medium">
          {active
            ? isPt ? 'Favorito' : 'Favorited'
            : isPt ? 'Favoritar' : 'Favorite'
          }
        </span>
      )}
    </button>
  );
}
