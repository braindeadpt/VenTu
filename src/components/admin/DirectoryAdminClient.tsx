'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LogIn, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchDirectoryListings,
  unverifyDirectoryListing,
  verifyDirectoryListing,
} from '@/lib/directoryListings';
import type { DirectoryEntry } from '@/types/directory';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function DirectoryAdminClient({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'unverified' | 'verified' | 'all'>('unverified');

  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setItems(await fetchDirectoryListings(sb));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    load().catch((err: Error) => setError(err.message));
  }, [session, load]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error(isPt ? 'Supabase não configurado' : 'Supabase not configured');
      const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : isPt ? 'Erro ao entrar' : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
  };

  const onVerify = async (id: string) => {
    if (!session?.user) return;
    setBusy(true);
    setError('');
    const sb = getSupabaseClient();
    if (!sb) return;
    const res = await verifyDirectoryListing(sb, id, session.user.id);
    if (!res.ok) setError(res.error);
    else await load();
    setBusy(false);
  };

  const onUnverify = async (id: string) => {
    setBusy(true);
    setError('');
    const sb = getSupabaseClient();
    if (!sb) return;
    const res = await unverifyDirectoryListing(sb, id);
    if (!res.ok) setError(res.error);
    else await load();
    setBusy(false);
  };

  const visible = items.filter((e) => {
    if (filter === 'unverified') return !e.verified;
    if (filter === 'verified') return !!e.verified;
    return true;
  });

  if (!isSupabaseConfigured()) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-body text-fg-muted">Supabase not configured.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-body text-fg-muted">{isPt ? 'A carregar…' : 'Loading…'}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto px-4 py-10 space-y-4">
        <h1 className="font-display text-h2 text-fg">
          {isPt ? 'Admin — Directório' : 'Admin — Directory'}
        </h1>
        <form onSubmit={(e) => void handleLogin(e)} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2"
            required
          />
          <Button type="submit" variant="secondary" loading={busy} leftIcon={<LogIn className="w-4 h-4" />}>
            {isPt ? 'Entrar' : 'Sign in'}
          </Button>
          {error && <p className="text-meta-sm text-score-poor">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h2 text-fg">
          {isPt ? 'Admin — Directório' : 'Admin — Directory'}
        </h1>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            {isPt ? 'Actualizar' : 'Refresh'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleLogout()}
            leftIcon={<LogOut className="w-4 h-4" />}
          >
            Logout
          </Button>
        </div>
      </div>

      <p className="text-meta-sm text-fg-muted">
        {isPt
          ? 'Conta com app_metadata.role = admin. Aprovar = badge Verificado no site.'
          : 'Account needs app_metadata.role = admin. Approve = Verified badge on site.'}
      </p>

      <div className="flex gap-2">
        {(['unverified', 'verified', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`pill min-h-[36px] px-3 ${filter === f ? 'pill-active' : 'pill-ghost'}`}
          >
            {f === 'unverified'
              ? isPt
                ? 'Por verificar'
                : 'Unverified'
              : f === 'verified'
                ? isPt
                  ? 'Verificados'
                  : 'Verified'
                : isPt
                  ? 'Todos'
                  : 'All'}
          </button>
        ))}
      </div>

      {error && <p className="text-meta-sm text-score-poor">{error}</p>}

      <div className="space-y-3">
        {visible.length === 0 ? (
          <p className="text-body text-fg-muted">{isPt ? 'Nada nesta lista.' : 'Nothing in this list.'}</p>
        ) : (
          visible.map((e) => (
            <Card key={e.id} variant="card-1" className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3 text-fg">{e.name}</h2>
                <span className={`text-meta-sm ${e.verified ? 'text-score-good' : 'text-fg-subtle'}`}>
                  {e.verified ? (isPt ? 'Verificado' : 'Verified') : isPt ? 'Não verificado' : 'Unverified'}
                </span>
              </div>
              <p className="text-meta-sm text-fg-muted">
                {e.kind} · {e.region || '—'} · {e.phone || e.website || e.address || '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                {!e.verified ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onVerify(e.id)}
                    leftIcon={<Check className="w-4 h-4" />}
                  >
                    {isPt ? 'Aprovar / verificar' : 'Approve / verify'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onUnverify(e.id)}
                    leftIcon={<ShieldOff className="w-4 h-4" />}
                  >
                    {isPt ? 'Remover verificação' : 'Unverify'}
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
