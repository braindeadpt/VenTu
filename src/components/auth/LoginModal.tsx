'use client';

import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { getTranslation } from '@/lib/i18n';

type LoginReason = 'favorite' | 'favorites-page' | 'general';

interface LoginModalProps {
  open: boolean;
  reason: LoginReason;
  locale: string;
  onClose: () => void;
  onSignIn: (email: string) => Promise<{ ok: boolean; error?: string }>;
}

export default function LoginModal({ open, reason, locale, onClose, onSignIn }: LoginModalProps) {
  const tr = getTranslation(locale);
  const t = tr.auth;
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const title =
    reason === 'favorite'
      ? t.titleFavorite
      : reason === 'favorites-page'
        ? t.titleFavoritesPage
        : t.titleDefault;

  const subtitle = reason === 'favorite' ? t.subtitleFavorite : t.subtitleDefault;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError('');
    const result = await onSignIn(email);
    setSending(false);
    if (result.ok) {
      setSent(true);
      setEmail('');
    } else {
      setError(result.error || t.errorSend);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-end sm:items-center justify-center p-4 bg-bg-base/70 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.signIn}
        className="card-hero w-full max-w-md p-5 sm:p-6 space-y-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 text-fg">{title}</h2>
            <p className="text-meta-sm text-fg-muted mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] min-w-[44px] min-h-[44px]"
            aria-label={tr.common.close}
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">{t.linkSent}</p>
            <Button variant="secondary" size="md" className="w-full" onClick={onClose}>
              {tr.common.close}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-xs text-fg-muted mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" aria-hidden />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg min-h-[44px]"
                  placeholder={t.emailPlaceholder}
                />
              </div>
            </div>
            {error && <p className="text-xs text-score-poor">{error}</p>}
            <Button type="submit" size="md" className="w-full" disabled={sending}>
              {sending ? t.sending : t.sendLink}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
