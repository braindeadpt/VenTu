export const CHECKINS_STORAGE_KEY = 'ventu:checkins';
export const CHECKINS_CHANGED_EVENT = 'ventu:checkins-changed';

export function readCheckinsFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHECKINS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function writeCheckinsToStorage(checkins: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHECKINS_STORAGE_KEY, JSON.stringify(checkins));
  window.dispatchEvent(new CustomEvent(CHECKINS_CHANGED_EVENT, { detail: checkins }));
}