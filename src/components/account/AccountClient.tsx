'use client';

import { useEffect, useState } from 'react';
import { LogOut, Heart, User, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchUserAlertPrefs, type UserAlertPrefs } from '@/lib/userAlerts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function AccountClient({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const { session, authLoading, favorites, signOut, requestLogin, isSupabaseReady } = useAuth();
  const [alertPrefs, setAlertPrefs] = useState<UserAlertPrefs | null>(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !session?.user) {
      setAlertPrefs(null);
      return;
    }
    void fetchUserAlertPrefs(sb, session.user.id).then(setAlertPrefs);
  }, [session?.user]);

  if (!isSupabaseReady) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {isPt ? 'Contas indisponíveis (Supabase não configurado).' : 'Accounts unavailable (Supabase not configured).'}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {isPt ? 'A carregar…' : 'Loading…'}
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
        <User className="w-10 h-10 mx-auto text-fg-subtle" aria-hidden />
        <h1 className="text-h2 text-fg">{isPt ? 'A tua conta' : 'Your account'}</h1>
        <p className="text-sm text-fg-muted">
          {isPt
            ? 'Entra com magic link para sincronizar favoritos entre dispositivos.'
            : 'Sign in with a magic link to sync favorites across devices.'}
        </p>
        <Button size="lg" onClick={() => requestLogin('general')}>
          {isPt ? 'Entrar com email' : 'Sign in with email'}
        </Button>
      </div>
    );
  }

  const email = session.user.email ?? '';

  return (
    <div className="max-w-lg mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-display-lg text-fg tracking-tight">{isPt ? 'Conta' : 'Account'}</h1>
        <p className="text-meta text-fg-muted mt-1">{email}</p>
      </div>

      <Card variant="card-1" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-windDir-onshore" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">{isPt ? 'Favoritos' : 'Favorites'}</p>
            <p className="text-meta-sm text-fg-muted">
              {favorites.length} {isPt ? 'spots guardados' : 'saved spots'}
            </p>
          </div>
        </div>
        <Button href={`/${locale}/favorites/`} variant="secondary" size="md" locale={locale as 'pt' | 'en'}>
          {isPt ? 'Ver favoritos' : 'View favorites'}
        </Button>
      </Card>

      <Card variant="card-1" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-data-waves" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">{isPt ? 'Alertas' : 'Alerts'}</p>
            <p className="text-meta-sm text-fg-muted">
              {!alertPrefs || !alertPrefs.active
                ? isPt
                  ? 'Desactivados'
                  : 'Disabled'
                : !alertPrefs.verified
                  ? isPt
                    ? 'Aguarda confirmação por email'
                    : 'Awaiting email confirmation'
                  : isPt
                    ? `Activos · score ≥ ${alertPrefs.min_score}`
                    : `Active · score ≥ ${alertPrefs.min_score}`}
            </p>
          </div>
        </div>
        <Button
          href={`/${locale}/favorites/#alertas`}
          variant="secondary"
          size="md"
          locale={locale as 'pt' | 'en'}
        >
          {isPt ? 'Gerir alertas' : 'Manage alerts'}
        </Button>
      </Card>

      <Button
        variant="ghost"
        size="md"
        className="text-fg-muted"
        onClick={() => void signOut()}
      >
        <LogOut className="w-4 h-4" aria-hidden />
        {isPt ? 'Sair' : 'Sign out'}
      </Button>
    </div>
  );
}
