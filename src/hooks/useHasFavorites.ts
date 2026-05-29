'use client';

import { useEffect, useState } from 'react';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoritesFromStorage,
} from '@/lib/favoritesStorage';

/**
 * `null` until mounted (SSR-safe); then whether the user has saved favorites.
 */
export function useHasFavorites(): boolean | null {
  const [hasFavorites, setHasFavorites] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => {
      setHasFavorites(readFavoritesFromStorage().length > 0);
    };
    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
  }, []);

  return hasFavorites;
}
