export const FAVORITES_STORAGE_KEY = 'windspot-favorites';
export const FAVORITES_CHANGED_EVENT = 'windspot:favorites-changed';

export function readFavoritesFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function writeFavoritesToStorage(favorites: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: favorites }));
}
