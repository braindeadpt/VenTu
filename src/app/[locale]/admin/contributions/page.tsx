'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { MapPin, Lightbulb, Bug, Mail, Calendar, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface Contribution {
  id: number;
  type: 'spot' | 'idea' | 'bug';
  message: string;
  email: string | null;
  locale: string;
  status: 'new' | 'done' | 'rejected';
  created_at: string;
}

const TYPE_ICONS = {
  spot: MapPin,
  idea: Lightbulb,
  bug: Bug,
};

const TYPE_LABELS = {
  spot: { pt: 'Spot', en: 'Spot' },
  idea: { pt: 'Ideia', en: 'Idea' },
  bug: { pt: 'Bug', en: 'Bug' },
};

const STATUS_STYLES = {
  new: 'bg-score-fair/15 text-score-fair border-score-fair/25',
  done: 'bg-score-epic/15 text-score-epic border-score-epic/25',
  rejected: 'bg-score-closed/15 text-score-closed border-score-closed/25',
};

export default function AdminContributionsPage() {
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const ADMIN_PASSWORD = 'Ventu2026'; // Simples proteção — altera se necessário

  useEffect(() => {
    if (!authenticated) return;
    loadData();
  }, [authenticated]);

  async function loadData() {
    if (!isSupabaseConfigured()) {
      setError('Supabase não configurado');
      setLoading(false);
      return;
    }

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase not available');

      const { data, error: fetchError } = await sb
        .from('contributions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setItems(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: number, status: 'done' | 'rejected') {
    try {
      const sb = getSupabaseClient() as any;
      if (!sb) return;
      await sb.from('contributions').update({ status }).eq('id', id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    } catch {
      /* ignore */
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Eliminar permanentemente?')) return;
    try {
      const sb = getSupabaseClient() as any;
      if (!sb) return;
      await sb.from('contributions').delete().eq('id', id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* ignore */
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="w-full max-w-sm card-2 p-6 space-y-4">
          <h1 className="text-h2 text-fg text-center">Admin VenTu</h1>
          <p className="text-body text-fg-muted text-center">Contribuições</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password === ADMIN_PASSWORD) setAuthenticated(true);
            }}
            placeholder="Password"
            className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50"
          />
          <button
            onClick={() => password === ADMIN_PASSWORD && setAuthenticated(true)}
            className="w-full h-10 px-4 bg-surface-2 border border-divider-strong rounded-lg text-fg font-medium hover:bg-surface-3 transition-colors"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2 text-fg">Contribuições</h1>
            <p className="text-meta text-fg-muted mt-1">
              {items.length} total · {items.filter((i) => i.status === 'new').length} novas
            </p>
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-divider text-sm text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-fg-muted">A carregar...</div>
        ) : error ? (
          <div className="text-center py-16 text-score-poor">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-fg-muted">Nenhuma contribuição ainda.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = TYPE_ICONS[item.type];
              return (
                <div
                  key={item.id}
                  className="card-1 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[item.status]}`}>
                        {item.status === 'new' ? 'Novo' : item.status === 'done' ? 'Feito' : 'Rejeitado'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        <Icon className="w-3.5 h-3.5" />
                        {TYPE_LABELS[item.type].pt}
                      </span>
                      <span className="text-xs text-fg-subtle flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleDateString('pt-PT', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateStatus(item.id, 'done')}
                        className="p-1.5 rounded-md text-fg-muted hover:text-score-epic hover:bg-score-epic/10 transition-colors"
                        title="Marcar como feito"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => updateStatus(item.id, 'rejected')}
                        className="p-1.5 rounded-md text-fg-muted hover:text-score-poor hover:bg-score-poor/10 transition-colors"
                        title="Rejeitar"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 rounded-md text-fg-muted hover:text-score-closed hover:bg-score-closed/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-body text-fg whitespace-pre-wrap">{item.message}</p>

                  {item.email && (
                    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Mail className="w-3.5 h-3.5" />
                      {item.email}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
