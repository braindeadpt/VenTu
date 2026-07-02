'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';

/**
 * `null` until mounted and favorites loaded; then whether the logged-in user has favorites.
 */
export function useHasFavorites(): boolean | null {
  const { session, favorites, favoritesReady } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !favoritesReady) return null;
  if (!session) return false;
  return favorites.length > 0;
}
