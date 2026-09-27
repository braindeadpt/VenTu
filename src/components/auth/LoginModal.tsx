'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { getTranslation } from '@/lib/i18n';
import { lockBodyScroll } from '@/lib/scrollLock';

type LoginReason = 'favorite' | 'favorites-page' | 'general';

interface LoginModalProps {
  open: boolean;
  reason: LoginReason;
  locale: string;
  onClose: () => void;
  onSignIn: (email: string) => Promise<{ ok: boolean; error?: string }>;
}

/** Focáveis do diálogo — a mesma lista que o `Drawer` usa (sem biblioteca nova). */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo de entrada. Declara `role="dialog" aria-modal="true"` — isto AFIRMA
 * ao leitor de ecrã que o resto da página está inerte, por isso cumpre o
 * contrato todo (mega audit 2026-09-26, achado A1: era o único de 32 diálogos
 * sem gestão de foco):
 *   1. ao abrir, o foco entra no primeiro campo;
 *   2. `Tab`/`Shift+Tab` ficam presos dentro do diálogo;
 *   3. `Escape` fecha (e o ✕ e o backdrop continuam a fechar);
 *   4. ao fechar, o foco volta ao controlo que abriu;
 *   5. o fundo não faz scroll enquanto está aberto.
 */
export default function LoginModal({ open, reason, locale, onClose, onSignIn }: LoginModalProps) {
  const tr = getTranslation(locale);
  const t = tr.auth;
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Foco inicial + bloqueio do fundo + devolver o foco ao fechar.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    previousFocusRef.current =
      previouslyFocused instanceof HTMLElement && previouslyFocused !== document.body
        ? previouslyFocused
        : null;
    // Bloqueio partilhado: o `Drawer`/`Header`/`SearchPalette` também trancam o
    // scroll e um deles a escrever `''` não pode destrancar este diálogo.
    const releaseScroll = lockBodyScroll();

    const raf = requestAnimationFrame(() => {
      // O campo de email é o primeiro campo; sem ele (ecrã «link enviado») o
      // próprio diálogo recebe o foco, para o `Tab` começar dentro.
      (emailRef.current ?? dialogRef.current)?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      releaseScroll();
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Escape fecha. Listener no documento (e não só no painel): com o foco preso
  // dentro do diálogo o evento sobe sempre, mas isto garante-o mesmo se o foco
  // for parar a um nó portalizado.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Depois de enviar o link, o formulário sai e o campo com o foco desaparece:
  // sem isto o foco ficaria no <body> e o Tab começava a partir do início do
  // documento (fora do diálogo).
  useEffect(() => {
    if (open && sent) dialogRef.current?.querySelector<HTMLButtonElement>('[data-login-close]')?.focus();
  }, [open, sent]);

  // Trap de Tab/Shift+Tab.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !root.contains(active)) {
      e.preventDefault();
      first.focus();
      return;
    }
    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.signIn}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="card-hero w-full max-w-md p-5 sm:p-6 space-y-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 text-fg">{title}</h2>
            <p className="text-meta-sm text-fg-muted mt-1">{subtitle}</p>
          </div>
          <button
            data-login-close
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
                  ref={emailRef}
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
