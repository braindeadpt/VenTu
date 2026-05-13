'use client';

import { useState } from 'react';
import { Send, X, MapPin, Lightbulb, Bug } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';

interface FeedbackFormProps {
  locale: string;
}

const TYPES = [
  { id: 'spot', labelPt: 'Novo spot', labelEn: 'New spot', icon: MapPin },
  { id: 'idea', labelPt: 'Ideia', labelEn: 'Idea', icon: Lightbulb },
  { id: 'bug', labelPt: 'Bug / Defeito', labelEn: 'Bug / Issue', icon: Bug },
];

export default function FeedbackForm({ locale }: FeedbackFormProps) {
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('spot');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!isSupabaseConfigured()) {
      setError(isPt ? 'Serviço temporariamente indisponível' : 'Service temporarily unavailable');
      return;
    }

    setSending(true);
    setError('');

    try {
      const sb = getSupabaseClient() as any;
      if (!sb) throw new Error('Supabase not available');

      const { error: insertError } = await sb.from('contributions').insert({
        type,
        message: message.trim(),
        email: email.trim() || null,
        locale,
      });

      if (insertError) throw insertError;

      setSent(true);
      setMessage('');
      setEmail('');
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || (isPt ? 'Erro ao enviar' : 'Error sending'));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
        {isPt ? 'Sugerir / Reportar' : 'Suggest / Report'}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md card-2 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-h3 text-fg">
            {isPt ? 'Contribuir para o VenTu' : 'Contribute to VenTu'}
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="py-8 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <p className="text-body text-fg">
              {isPt ? 'Obrigado! Recebemos a tua contribuição.' : 'Thank you! We received your contribution.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                      transition-all duration-fast
                      ${active
                        ? 'bg-surface-2 text-fg border border-divider-strong'
                        : 'bg-surface-1 text-fg-muted border border-divider hover:bg-surface-2 hover:text-fg'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{isPt ? t.labelPt : t.labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* Message */}
            <div>
              <label className="block text-meta-sm text-fg-muted mb-1.5">
                {type === 'spot'
                  ? (isPt ? 'Descrição do spot' : 'Spot description')
                  : type === 'idea'
                    ? (isPt ? 'A tua ideia' : 'Your idea')
                    : (isPt ? 'Descrição do problema' : 'Issue description')}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'spot'
                    ? (isPt ? 'Nome, localização, condições ideais, acesso...' : 'Name, location, ideal conditions, access...')
                    : type === 'idea'
                      ? (isPt ? 'Descreve a tua sugestão...' : 'Describe your suggestion...')
                      : (isPt ? 'O que não está a funcionar?' : 'What is not working?')
                }
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50 resize-none"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-meta-sm text-fg-muted mb-1.5">
                {isPt ? 'Email (opcional)' : 'Email (optional)'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isPt ? 'Para te contactarmos de volta' : 'So we can reach you back'}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50"
              />
            </div>

            {error && (
              <p className="text-sm text-score-poor">{error}</p>
            )}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="w-full flex items-center justify-center gap-2 h-11 px-4 bg-surface-2 border border-divider-strong rounded-lg text-fg font-medium hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {sending
                ? (isPt ? 'A enviar...' : 'Sending...')
                : (isPt ? 'Enviar contribuição' : 'Send contribution')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
