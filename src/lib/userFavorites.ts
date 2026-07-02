import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FAVORITES_CHANGED_EVENT,
  FAVORITES_STORAGE_KEY,
  readFavoritesFromStorage,
} from '@/lib/favoritesStorage';
import { FAVORITES_MIGRATED_KEY } from '@/lib/auth';

export async function fetchUserFavorites(sb: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await sb
    .from('user_favorites')
    .select('spot_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.spot_id as string);
}

export async function addUserFavorite(sb: SupabaseClient, userId: string, spotId: string): Promise<void> {
  const { error } = await sb.from('user_favorites').insert({ user_id: userId, spot_id: spotId });
  if (error && error.code !== '23505') throw error;
}

export async function removeUserFavorite(sb: SupabaseClient, userId: string, spotId: string): Promise<void> {
  const { error } = await sb
    .from('user_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('spot_id', spotId);
  if (error) throw error;
}

export async function migrateLegacyFavorites(sb: SupabaseClient, userId: string): Promise<string[]> {
  if (typeof window === 'undefined') return [];

  try {
    if (localStorage.getItem(FAVORITES_MIGRATED_KEY)) {
      return fetchUserFavorites(sb, userId);
    }

    const legacy = readFavoritesFromStorage();
    if (legacy.length > 0) {
      const rows = legacy.map((spot_id) => ({ user_id: userId, spot_id }));
      const { error } = await sb.from('user_favorites').upsert(rows, {
        onConflict: 'user_id,spot_id',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    localStorage.removeItem(FAVORITES_STORAGE_KEY);
    localStorage.setItem(FAVORITES_MIGRATED_KEY, '1');
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
  } catch {
    // Non-fatal — user can re-add favorites manually
  }

  return fetchUserFavorites(sb, userId);
}

export function notifyFavoritesChanged(favorites: string[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: favorites }));
}
