'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useParams } from 'next/navigation';
import { getAuthCallbackUrl } from '@/lib/auth';
import { FAVORITES_CHANGED_EVENT } from '@/lib/favoritesStorage';
import {
  addUserFavorite,
  migrateLegacyFavorites,
  notifyFavoritesChanged,
  removeUserFavorite,
} from '@/lib/userFavorites';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import LoginModal from '@/components/auth/LoginModal';

type LoginReason = 'favorite' | 'favorites-page' | 'general';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  authLoading: boolean;
  favorites: string[];
  favoritesLoading: boolean;
  favoritesReady: boolean;
  isSupabaseReady: boolean;
  requestLogin: (reason?: LoginReason) => void;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  toggleFavorite: (spotId: string) => Promise<void>;
  isFavorite: (spotId: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useFavorites() {
  const { favorites, favoritesLoading, favoritesReady, toggleFavorite, isFavorite, requestLogin, isSupabaseReady, session } = useAuth();
  return {
    favorites,
    toggleFavorite,
    isFavorite,
    loaded: favoritesReady,
    mounted: favoritesReady,
    count: favorites.length,
    loading: favoritesLoading,
    requestLogin,
    isSupabaseReady,
    isLoggedIn: !!session,
  };
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const isPt = locale === 'pt';

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured());
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(!isSupabaseConfigured());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<LoginReason>('general');

  const loadFavorites = useCallback(async (userId: string) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setFavoritesLoading(true);
    try {
      const ids = await migrateLegacyFavorites(sb, userId);
      setFavorites(ids);
      notifyFavoritesChanged(ids);
    } catch {
      setFavorites([]);
    } finally {
      setFavoritesLoading(false);
      setFavoritesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthLoading(false);
      setFavoritesReady(true);
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setAuthLoading(false);
      setFavoritesReady(true);
      return;
    }

    let cancelled = false;

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setFavorites([]);
      setFavoritesReady(true);
      return;
    }
    void loadFavorites(session.user.id);
  }, [session?.user?.id, loadFavorites]);

  const requestLogin = useCallback((reason: LoginReason = 'general') => {
    setLoginReason(reason);
    setLoginOpen(true);
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const sb = getSupabaseClient();
    if (!sb) {
      return { ok: false, error: isPt ? 'Conta indisponível' : 'Account unavailable' };
    }

    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: getAuthCallbackUrl(locale),
        data: { locale },
      },
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [isPt, locale]);

  const signOut = useCallback(async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setFavorites([]);
    setFavoritesReady(true);
    notifyFavoritesChanged([]);
  }, []);

  const toggleFavorite = useCallback(async (spotId: string) => {
    const sb = getSupabaseClient();
    if (!sb || !session?.user) return;

    const userId = session.user.id;
    const wasFavorite = favorites.includes(spotId);

    if (wasFavorite) {
      setFavorites((prev) => prev.filter((id) => id !== spotId));
      try {
        await removeUserFavorite(sb, userId, spotId);
        notifyFavoritesChanged(favorites.filter((id) => id !== spotId));
      } catch {
        await loadFavorites(userId);
      }
      return;
    }

    setFavorites((prev) => [...prev, spotId]);
    try {
      await addUserFavorite(sb, userId, spotId);
      notifyFavoritesChanged([...favorites, spotId]);
    } catch {
      await loadFavorites(userId);
    }
  }, [favorites, loadFavorites, session]);

  const isFavorite = useCallback((spotId: string) => favorites.includes(spotId), [favorites]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      authLoading,
      favorites,
      favoritesLoading,
      favoritesReady,
      isSupabaseReady: isSupabaseConfigured(),
      requestLogin,
      signInWithEmail,
      signOut,
      toggleFavorite,
      isFavorite,
    }),
    [
      session,
      authLoading,
      favorites,
      favoritesLoading,
      favoritesReady,
      requestLogin,
      signInWithEmail,
      signOut,
      toggleFavorite,
      isFavorite,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginModal
        open={loginOpen}
        reason={loginReason}
        locale={locale}
        onClose={() => setLoginOpen(false)}
        onSignIn={signInWithEmail}
      />
    </AuthContext.Provider>
  );
}
