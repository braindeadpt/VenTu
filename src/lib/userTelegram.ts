import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserTelegramRow {
  user_id: string;
  chat_id: number | null;
  link_token: string | null;
  link_token_expires: string | null;
  linked_at: string | null;
}

/** Public bot username without @ — from env at build time. Empty = feature hidden. */
export function getTelegramBotUsername(): string {
  return (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
}

export function isTelegramAlertsEnabled(): boolean {
  return getTelegramBotUsername().length > 0;
}

export async function fetchUserTelegram(
  sb: SupabaseClient,
  userId: string,
): Promise<UserTelegramRow | null> {
  const { data, error } = await sb
    .from('user_telegram')
    .select('user_id, chat_id, link_token, link_token_expires, linked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data as UserTelegramRow | null;
}

export function isTelegramLinked(row: UserTelegramRow | null): boolean {
  return row != null && row.chat_id != null;
}

export async function createTelegramLinkToken(
  sb: SupabaseClient,
): Promise<{ ok: true; token: string } | { ok: false; error?: string }> {
  const { data, error } = await sb.rpc('create_telegram_link_token');
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; token?: string; error?: string } | null;
  if (!row?.ok || !row.token) return { ok: false, error: row?.error || 'failed' };
  return { ok: true, token: row.token };
}

export async function unlinkTelegram(
  sb: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb.rpc('unlink_telegram');
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  return { ok: row?.ok === true, error: row?.error };
}

export function telegramDeepLink(token: string): string {
  const bot = getTelegramBotUsername();
  return `https://t.me/${bot}?start=${encodeURIComponent(token)}`;
}
