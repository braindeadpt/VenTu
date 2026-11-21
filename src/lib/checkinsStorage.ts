export const CHECKINS_STORAGE_KEY = 'ventu:checkins';
export const CHECKINS_CHANGED_EVENT = 'ventu:checkins-changed';

export function readCheckinsFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHECKINS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeCheckinsToStorage(checkins: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHECKINS_STORAGE_KEY, JSON.stringify(checkins));
  window.dispatchEvent(new CustomEvent(CHECKINS_CHANGED_EVENT, { detail: checkins }));
}