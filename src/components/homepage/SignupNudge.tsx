'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';

interface SignupNudgeProps {
  locale: string;
}

const LS_NUDGE_SEEN = 'ventu:seenSignupNudge';
const LS_SPOT_VIEWS = 'ventu:spotViews';

/**
 * Increment the anonymous spot-view counter (signed-out users only).
 */
export function trackSpotView(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_SPOT_VIEWS);
    const count = raw ? Number(raw) : 0;
    localStorage.setItem(LS_SPOT_VIEWS, String(count + 1));
  } catch { /* noop */ }
}

/**
 * Banner fixo no fundo da página, apenas para utilizadores não autenticados
 * que viram ≥3 spots e nunca fecharam o nudge.
 */
export default function SignupNudge({ locale }: SignupNudgeProps) {
  const isPt = locale === 'pt';
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setVisible(false);
      return;
    }
    try {
      const dismissed = localStorage.getItem(LS_NUDGE_SEEN);
      if (dismissed) return;
      const raw = localStorage.getItem(LS_SPOT_VIEWS);
      const count = raw ? Number(raw) : 0;
      if (count >= 3) {
        setVisible(true);
      }
    } catch { /* noop */ }
  }, [session?.user]);

  useEffect(() => {
    document.body.classList.toggle('ventu-signup-nudge-open', visible);
    return () => document.body.classList.remove('ventu-signup-nudge-open');
  }, [visible]);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(LS_NUDGE_SEEN, '1');
    } catch { /* noop */ }
  };

  if (!visible || session?.user) return null;

  return (
    <div
      role="status"
      className="ventu-signup-nudge fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated border-t border-divider shadow-modal motion-reduce:transition-none transition-transform duration-300 ease-out"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-pill bg-accent/15 text-accent" aria-hidden>
          <Bell className="w-4 h-4" />
        </div>
        <p className="flex-1 text-body-sm text-fg leading-snug">
          {isPt
            ? 'Recebes as condições dos teus spots todas as manhãs (~7h30). Cria conta gratuita.'
            : 'Get your spots\' conditions every morning (~7:30 AM). Create a free account.'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/${locale}/conta/`}
            className="inline-flex items-center px-3 py-1.5 rounded-input text-meta-sm font-semibold bg-accent text-bg-base hover:bg-accent-hover transition-colors motion-reduce:transition-none"
          >
            {isPt ? 'Criar conta' : 'Sign up'}
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center px-2 py-1.5 rounded-input text-meta-sm text-fg-muted hover:text-fg transition-colors"
            aria-label={isPt ? 'Fechar' : 'Close'}
          >
            {isPt ? 'Agora não' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
}
