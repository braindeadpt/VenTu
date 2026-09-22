'use client';

import { useEffect, useState } from 'react';
import { LogOut, Heart, User, Bell, GraduationCap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient, hasTestSupabaseClient } from '@/lib/supabase';
import { fetchUserAlertPrefs, alertModeLabel, type UserAlertPrefs } from '@/lib/userAlerts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import TelegramLinkCard from '@/components/account/TelegramLinkCard';
import { getTranslation } from '@/lib/i18n';

export default function AccountClient({ locale }: { locale: string }) {
  const f = getTranslation(locale).account;
  const { session, authLoading, favorites, signOut, requestLogin, isSupabaseReady } = useAuth();
  // The Supabase-configured state is baked at build time, so a keyless build
  // and a keyed build disagree about it between server render and the first
  // client paint (the E2E mock flips readiness client-side on purpose).
  // Staying on the loading state until mount keeps the hydrated subtree
  // identical in every build; the branches below are stable afterwards.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [alertPrefs, setAlertPrefs] = useState<UserAlertPrefs | null>(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !session?.user) {
      setAlertPrefs(null);
      return;
    }
    void fetchUserAlertPrefs(sb, session.user.id).then(setAlertPrefs);
  }, [session?.user]);

  const supabaseReady = isSupabaseReady || hasTestSupabaseClient();

  if (!mounted || authLoading) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {f.loading}
      </div>
    );
  }

  if (!supabaseReady) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {f.unavailable}
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
        <User className="w-10 h-10 mx-auto text-fg-subtle" aria-hidden />
        <h1 className="text-h2 text-fg">{f.signedOutTitle}</h1>
        <p className="text-sm text-fg-muted">{f.signedOutBody}</p>
        <Button size="lg" onClick={() => requestLogin('general')}>
          {f.signInWithEmail}
        </Button>
      </div>
    );
  }

  const email = session.user.email ?? '';

  return (
    <div className="max-w-lg mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-display-lg text-fg tracking-tight">{f.title}</h1>
        <p className="text-meta text-fg-muted mt-1">{email}</p>
      </div>

      <Card variant="card-1" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-windDir-onshore" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">{f.favorites}</p>
            <p className="text-meta-sm text-fg-muted">
              {favorites.length} {f.savedSpots}
            </p>
          </div>
        </div>
        <Button href={`/${locale}/favorites/`} variant="secondary" size="md" locale={locale as 'pt' | 'en'}>
          {f.viewFavorites}
        </Button>
      </Card>

      <Card variant="card-1" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-data-waves" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">{f.alerts}</p>
            <p className="text-meta-sm text-fg-muted">
              {!alertPrefs || !alertPrefs.active
                ? f.alertsDisabled
                : !alertPrefs.verified
                  ? f.alertsAwaiting
                  : f.alertsActive
                      .replace('{score}', String(alertPrefs.min_score))
                      .replace('{mode}', alertModeLabel(alertPrefs.alert_mode, locale))}
            </p>
          </div>
        </div>
        <Button
          href={`/${locale}/favorites/#alertas`}
          variant="secondary"
          size="md"
          locale={locale as 'pt' | 'en'}
        >
          {f.manageAlerts}
        </Button>
      </Card>

      <Card variant="card-1" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-fg-muted" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">{f.schoolsShops}</p>
            <p className="text-meta-sm text-fg-muted">{f.manageProfilesDesc}</p>
          </div>
        </div>
        <Button
          href={`/${locale}/diretorio/gerir/`}
          variant="secondary"
          size="md"
          locale={locale as 'pt' | 'en'}
        >
          {f.manageProfiles}
        </Button>
      </Card>

      <TelegramLinkCard locale={locale} />

      <Button
        variant="ghost"
        size="md"
        className="text-fg-muted"
        onClick={() => void signOut()}
      >
        <LogOut className="w-4 h-4" aria-hidden />
        {f.signOut}
      </Button>
    </div>
  );
}
