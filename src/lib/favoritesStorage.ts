export const FAVORITES_STORAGE_KEY = 'ventu:favorites';
export const FAVORITES_CHANGED_EVENT = 'ventu:favorites-changed';

const LEGACY_FAVORITES_STORAGE_KEY = 'windspot-favorites';
const LEGACY_FAVORITES_CHANGED_EVENT = 'windspot:favorites-changed';

function migrateLegacyFavorites(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const legacy = localStorage.getItem(LEGACY_FAVORITES_STORAGE_KEY);
    if (!legacy) return null;
    if (!localStorage.getItem(FAVORITES_STORAGE_KEY)) {
      localStorage.setItem(FAVORITES_STORAGE_KEY, legacy);
    }
    localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
    return legacy;
  } catch {
    return null;
  }
}

export function readFavoritesFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored =
      localStorage.getItem(FAVORITES_STORAGE_KEY) ?? migrateLegacyFavorites();
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function writeFavoritesToStorage(favorites: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  // Drop legacy key once we own the write path.
  try {
    localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: favorites }));
  // Keep legacy listeners alive for one release cycle.
  window.dispatchEvent(new CustomEvent(LEGACY_FAVORITES_CHANGED_EVENT, { detail: favorites }));
}
