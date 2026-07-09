import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHECKINS_CHANGED_EVENT,
  CHECKINS_STORAGE_KEY,
  readCheckinsFromStorage,
} from '@/lib/checkinsStorage';
import { CHECKINS_MIGRATED_KEY } from '@/lib/auth';

export async function fetchUserCheckins(sb: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await sb
    .from('user_checkins')
    .select('spot_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.spot_id as string);
}

export async function addUserCheckin(sb: SupabaseClient, userId: string, spotId: string): Promise<void> {
  const { error } = await sb.from('user_checkins').insert({ user_id: userId, spot_id: spotId });
  if (error && error.code !== '23505') throw error;
}

export async function removeUserCheckin(sb: SupabaseClient, userId: string, spotId: string): Promise<void> {
  const { error } = await sb
    .from('user_checkins')
    .delete()
    .eq('user_id', userId)
    .eq('spot_id', spotId);
  if (error) throw error;
}

export async function migrateLegacyCheckins(sb: SupabaseClient, userId: string): Promise<string[]> {
  if (typeof window === 'undefined') return [];

  try {
    if (localStorage.getItem(CHECKINS_MIGRATED_KEY)) {
      return fetchUserCheckins(sb, userId);
    }

    const legacy = readCheckinsFromStorage();
    if (legacy.length > 0) {
      const rows = legacy.map((spot_id) => ({ user_id: userId, spot_id }));
      const { error } = await sb.from('user_checkins').upsert(rows, {
        onConflict: 'user_id,spot_id',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    localStorage.removeItem(CHECKINS_STORAGE_KEY);
    localStorage.setItem(CHECKINS_MIGRATED_KEY, '1');
    window.dispatchEvent(new CustomEvent(CHECKINS_CHANGED_EVENT));
  } catch {
    // Non-fatal — user can re-add checkins manually
  }

  return fetchUserCheckins(sb, userId);
}

export function notifyCheckinsChanged(checkins: string[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHECKINS_CHANGED_EVENT, { detail: checkins }));
}