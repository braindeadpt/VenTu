'use client';

import { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, RefreshCw, Trash2, Check, X } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

type ContributionStatus = 'new' | 'done' | 'rejected';

interface Contribution {
  id: number;
  type: string;
  message: string;
  email: string | null;
  locale: string;
  client_id: string;
  status: ContributionStatus;
  created_at: string;
}

interface ContributionsAdminClientProps {
  locale: string;
}

export default function ContributionsAdminClient({ locale }: ContributionsAdminClientProps) {
  const isPt = locale === 'pt';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ContributionStatus>('all');

  const loadContributions = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (sb as any)
      .from('contributions')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;
    setItems((data as Contribution[]) || []);
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

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadContributions().catch((err: Error) => setError(err.message));
  }, [session, loadContributions]);

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
      setError(err instanceof Error ? err.message : (isPt ? 'Erro ao entrar' : 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setItems([]);
    setEmail('');
    setPassword('');
  };

  const updateStatus = async (id: number, status: ContributionStatus) => {
    setBusy(true);
    setError('');
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase not configured');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (sb as any)
        .from('contributions')
        .update({ status })
        .eq('id', id);

      if (updateError) throw updateError;
      await loadContributions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm(isPt ? 'Apagar esta contribuição?' : 'Delete this contribution?')) return;

    setBusy(true);
    setError('');
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase not configured');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (sb as any)
        .from('contributions')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await loadContributions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center text-fg-muted">
        {isPt ? 'Supabase não configurado.' : 'Supabase is not configured.'}
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto py-16 px-4 animate-pulse h-32 bg-surface-1 rounded-lg" />;
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold text-fg mb-2">
          {isPt ? 'Admin — Contribuições' : 'Admin — Contributions'}
        </h1>
        <p className="text-sm text-fg-muted mb-6">
          {isPt
            ? 'Entra com a conta Supabase Auth (criada no dashboard).'
            : 'Sign in with your Supabase Auth account (created in the dashboard).'}
        </p>

        <form onSubmit={handleLogin} className="space-y-4 card-2 p-6">
          <div>
            <label className="block text-sm text-fg-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-fg"
            />
          </div>
          <div>
            <label className="block text-sm text-fg-muted mb-1">
              {isPt ? 'Password' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-fg"
            />
          </div>
          {error && <p className="text-sm text-score-poor">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-data-waves text-bg-base font-medium disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {busy ? (isPt ? 'A entrar...' : 'Signing in...') : (isPt ? 'Entrar' : 'Sign in')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">
            {isPt ? 'Contribuições' : 'Contributions'}
          </h1>
          <p className="text-sm text-fg-muted">{session.user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadContributions().catch((err: Error) => setError(err.message))}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-divider text-sm hover:bg-surface-1"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {isPt ? 'Actualizar' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-divider text-sm hover:bg-surface-1"
          >
            <LogOut className="w-4 h-4" />
            {isPt ? 'Sair' : 'Sign out'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'new', 'done', 'rejected'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              filter === key
                ? 'bg-surface-2 border-divider-strong text-fg'
                : 'border-divider text-fg-muted hover:text-fg'
            }`}
          >
            {key === 'all' ? (isPt ? 'Todas' : 'All') : key}
            {key !== 'all' && (
              <span className="ml-1 font-mono text-xs">
                ({items.filter((i) => i.status === key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-score-poor">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-fg-muted text-center py-12">
          {isPt ? 'Sem contribuições.' : 'No contributions.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id} className="card-2 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span className="font-mono">#{item.id}</span>
                <span className="uppercase">{item.type}</span>
                <span>{item.status}</span>
                <span>{item.locale}</span>
                <span>{new Date(item.created_at).toLocaleString(locale)}</span>
              </div>
              <p className="text-sm text-fg whitespace-pre-wrap">{item.message}</p>
              {item.email && (
                <p className="text-xs text-fg-muted">{item.email}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {item.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'done')}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-score-good/10 text-score-good border border-score-good/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Done
                  </button>
                )}
                {item.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'rejected')}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-score-fair/10 text-score-fair border border-score-fair/20"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                )}
                {item.status !== 'new' && (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'new')}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border border-divider text-fg-muted"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteItem(item.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-score-poor border border-score-poor/20 hover:bg-score-poor/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isPt ? 'Apagar' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
