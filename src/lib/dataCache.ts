/** Persist last successful conditions fetch timestamp for offline UX. */
const LAST_UPDATE_KEY = 'ventu:last-data-update';

export function rememberDataUpdate(updatedAt: string | undefined | null): void {
  if (typeof window === 'undefined' || !updatedAt) return;
  try {
    localStorage.setItem(LAST_UPDATE_KEY, updatedAt);
  } catch {
    /* noop */
  }
}
