'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, X, MapPin, Lightbulb, Bug, MessageSquare } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';

interface FeedbackFormProps {
  locale: string;
  /** Pre-fill spot slug when opened from spot detail */
  defaultSpotSlug?: string;
}

const TYPES = [
  { id: 'spot', icon: MapPin },
  { id: 'tip', icon: MessageSquare },
  { id: 'idea', icon: Lightbulb },
  { id: 'bug', icon: Bug },
] as const;

const TIP_FIELDS = [
  { id: 'bestTide' },
  { id: 'parking' },
  { id: 'food' },
  { id: 'localRule' },
] as const;

const CLIENT_ID_KEY = 'ventu:client_id';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const t = getTranslation(locale);
  const f = t.feedback;
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
      setError(f.errorUnavailable);
      return;
    }

    setSending(true);
    setError('');

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase not available');

      // Anon writes go through the hardened RPC (per-IP rate limit) — direct
      // INSERT is revoked in supabase-contributions-harden-rpc.sql.
      // The Supabase client has no generated Database types, so use explicit
      // rpc-style cast until `supabase gen types` is wired into CI.
      const { data, error: rpcError } = await (sb as any).rpc('submit_contribution', {
        p_type: type,
        p_message: message.trim(),
        p_email: email.trim() || null,
        p_locale: locale,
        p_client_id: getClientId(),
        p_spot_slug: type === 'tip' ? spotSlug.trim() || null : null,
        p_tip_field: type === 'tip' ? tipField : null,
      });

      if (rpcError) throw rpcError;
      if (!data?.ok) {
        setError(data?.error === 'rate_limit' ? f.errorRateLimit : f.errorSend);
        return;
      }

      setSent(true);
      setMessage('');
      setEmail('');
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || f.errorSend);
    } finally {
      setSending(false);
    }
  };

  // Modal a11y (declared before the `!open` early return — rules of hooks):
  // role=dialog above the header (z-[1300]) and drawer (z-[1200]); focus
  // starts inside and Tab is trapped so keyboard users can't escape into the
  // page behind the modal.
  const modalRef = useRef<HTMLDivElement>(null);
  // Auto-fecho após enviar (2 s) — limpo no unmount para não haver setState
  // depois de desmontar.
  const closeTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable[0] as HTMLElement | undefined)?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-divider-strong bg-surface-1/[0.06] px-3.5 py-2 min-h-[44px] text-sm font-medium text-fg hover:bg-surface-2/[0.10] transition-colors"
      >
        <MessageSquare className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
        {f.trigger}
      </button>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key !== 'Tab') return;
    // Trap Tab inside the dialog.
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Modal — role=dialog above the header (z-[1300]) and drawer (z-[1200]) */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative w-full max-w-md card-2 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 id="feedback-title" className="text-h3 text-fg">
            {f.title}
          </h3>
      <button
        onClick={() => setOpen(false)}
        className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
        aria-label={t.common.close}
      >
        <X className="w-5 h-5" />
      </button>
        </div>

        {sent ? (
          <div className="py-8 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <p className="text-body text-fg">{f.thanks}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {TYPES.map((entry) => {
                const Icon = entry.icon;
                const active = type === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setType(entry.id)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                      transition-all duration-fast
                      ${active
                        ? 'bg-surface-2/[0.08] text-fg border border-divider-strong'
                        : 'bg-surface-1/[0.04] text-fg-muted border border-divider hover:bg-surface-2/[0.08] hover:text-fg'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{f.types[entry.id]}</span>
                  </button>
                );
              })}
            </div>

            {/* Message */}
            <div>
              <label htmlFor="ff-message" className="block text-meta-sm text-fg-muted mb-1.5">
                {type === 'spot'
                  ? f.describeSpot
                  : type === 'tip'
                    ? f.describeTip
                  : type === 'idea'
                    ? f.describeIdea
                    : f.describeBug}
              </label>
              <textarea
                id="ff-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'spot'
                    ? f.placeholderSpot
                    : type === 'tip'
                      ? f.placeholderTip
                    : type === 'idea'
                      ? f.placeholderIdea
                      : f.placeholderBug
                }
                rows={4}
                maxLength={2000}
                className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50 resize-none"
                required
              />
            </div>

            {type === 'tip' && (
              <>
                <div>
                  <label htmlFor="ff-spot-slug" className="block text-meta-sm text-fg-muted mb-1.5">
                    {f.spotSlug}
                  </label>
                  <input
                    id="ff-spot-slug"
                    type="text"
                    value={spotSlug}
                    onChange={(e) => setSpotSlug(e.target.value)}
                    placeholder="guincho, nazare, supertubos..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ff-tip-field" className="block text-meta-sm text-fg-muted mb-1.5">
                    {f.tipType}
                  </label>
                  <select
                    id="ff-tip-field"
                    value={tipField}
                    onChange={(e) => setTipField(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-body text-fg"
                  >
                    {TIP_FIELDS.map((field) => (
                      <option key={field.id} value={field.id}>
                        {f.tips[field.id]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label htmlFor="ff-email" className="block text-meta-sm text-fg-muted mb-1.5">
                {f.emailOptional}
              </label>
              <input
                id="ff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={f.emailPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-body text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-score-good/50"
              />
            </div>

            {error && (
              <p className="text-sm text-score-poor">{error}</p>
            )}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="w-full flex items-center justify-center gap-2 h-11 px-4 bg-surface-2/[0.08] border border-divider-strong rounded-lg text-fg font-medium hover:bg-surface-3/[0.12] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {sending ? f.submitting : f.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
