'use client';

import { useState } from 'react';
import { Send, X, MapPin, Lightbulb, Bug, MessageSquare } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';

interface FeedbackFormProps {
  locale: string;
  /** Pre-fill spot slug when opened from spot detail */
  defaultSpotSlug?: string;
}

const TYPES = [
  { id: 'spot', labelPt: 'Novo spot', labelEn: 'New spot', icon: MapPin },
  { id: 'tip', labelPt: 'Dica local', labelEn: 'Local tip', icon: MessageSquare },
  { id: 'idea', labelPt: 'Ideia', labelEn: 'Idea', icon: Lightbulb },
  { id: 'bug', labelPt: 'Bug / Defeito', labelEn: 'Bug / Issue', icon: Bug },
];

const TIP_FIELDS = [
  { id: 'bestTide', labelPt: 'Maré ideal', labelEn: 'Best tide' },
  { id: 'parking', labelPt: 'Estacionamento', labelEn: 'Parking' },
  { id: 'food', labelPt: 'Onde comer', labelEn: 'Food' },
  { id: 'localRule', labelPt: 'Regra local', labelEn: 'Local rule' },
];

const CLIENT_ID_KEY = 'ventu:client_id';

function getClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export default function FeedbackForm({ locale, defaultSpotSlug }: FeedbackFormProps) {
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(defaultSpotSlug ? 'tip' : 'spot');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [spotSlug, setSpotSlug] = useState(defaultSpotSlug || '');
  const [tipField, setTipField] = useState('localRule');
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
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase not available');

      // The Supabase client has no generated Database types, so
      // `from('contributions')` infers `never`. Use explicit rpc-style
      // cast until `supabase gen types` is wired into CI.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (sb as any)
        .from('contributions')
        .insert({
          type,
          message: message.trim(),
          email: email.trim() || null,
          locale,
          client_id: getClientId(),
          spot_slug: type === 'tip' ? spotSlug.trim() || null : null,
          tip_field: type === 'tip' ? tipField : null,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
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
        aria-label={isPt ? 'Fechar' : 'Close'}
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
              <label htmlFor="ff-message" className="block text-meta-sm text-fg-muted mb-1.5">
                {type === 'spot'
                  ? (isPt ? 'Descrição do spot' : 'Spot description')
                  : type === 'tip'
                    ? (isPt ? 'A tua dica' : 'Your tip')
                  : type === 'idea'
                    ? (isPt ? 'A tua ideia' : 'Your idea')
                    : (isPt ? 'Descrição do problema' : 'Issue description')}
              </label>
              <textarea
                id="ff-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'spot'
                    ? (isPt ? 'Nome, localização, condições ideais, acesso...' : 'Name, location, ideal conditions, access...')
                    : type === 'tip'
                      ? (isPt ? 'Partilha conhecimento local (maré, estacionamento, regras...)' : 'Share local knowledge (tide, parking, rules...)')
                    : type === 'idea'
                      ? (isPt ? 'Descreve a tua sugestão...' : 'Describe your suggestion...')
                      : (isPt ? 'O que não está a funcionar?' : 'What is not working?')
                }
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50 resize-none"
                required
              />
            </div>

            {type === 'tip' && (
              <>
                <div>
                  <label htmlFor="ff-spot-slug" className="block text-meta-sm text-fg-muted mb-1.5">
                    {isPt ? 'Slug do spot' : 'Spot slug'}
                  </label>
                  <input
                    id="ff-spot-slug"
                    type="text"
                    value={spotSlug}
                    onChange={(e) => setSpotSlug(e.target.value)}
                    placeholder="guincho, nazare, supertubos..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ff-tip-field" className="block text-meta-sm text-fg-muted mb-1.5">
                    {isPt ? 'Tipo de dica' : 'Tip type'}
                  </label>
                  <select
                    id="ff-tip-field"
                    value={tipField}
                    onChange={(e) => setTipField(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-divider text-body text-fg"
                  >
                    {TIP_FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {isPt ? f.labelPt : f.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label htmlFor="ff-email" className="block text-meta-sm text-fg-muted mb-1.5">
                {isPt ? 'Email (opcional)' : 'Email (optional)'}
              </label>
              <input
                id="ff-email"
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
