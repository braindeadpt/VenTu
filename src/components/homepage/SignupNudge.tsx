'use client';

import { getTranslation } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
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
  const t = getTranslation(locale);
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setVisible(false);
      return;
    }
    // Suprimido onde o nudge compete com a CTA própria da página (signup já
    // é a acção principal em /alerts /conta /auth), onde tapa listas
    // accionáveis (/favorites /compare) e no mapa (ferramenta fullscreen).
    const path = window.location.pathname;
    if (/(?:^|\/)(alerts|favorites|conta|compare|auth|mapa|admin)(?:\/|$)/.test(path)) return;
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
    <div className="ventu-signup-nudge fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated border-t border-divider shadow-modal motion-reduce:transition-none transition-transform duration-300 ease-out">
      {/* <480px: coluna (texto a full-width + botões por baixo) — em linha o
          texto espremia-se para ~150px e o nudge chegava a ~145px de altura. */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-3">
        <div className="shrink-0 hidden min-[480px]:flex items-center justify-center w-9 h-9 rounded-pill bg-accent/15 text-accent" aria-hidden>
          <Bell className="w-4 h-4" />
        </div>
        <p className="flex-1 text-body-sm text-fg leading-snug">
          {t.homepage.signupNudgeBody}
        </p>
        <div className="flex items-center justify-end gap-2 shrink-0">
          <Link
            href={`/${locale}/conta/`}
            className="inline-flex items-center min-h-[44px] px-4 rounded-input text-meta-sm font-semibold bg-accent text-bg-base hover:bg-accent-hover transition-colors motion-reduce:transition-none"
          >
            {t.homepage.signUp}
          </Link>
          {/* Dismiss: texto em sm+, × compacto em mobile — com os dois botões
              lado a lado o nudge chegava a 132px e tapava o fundo da página
              (o padding reservado é 88px). */}
          <button
            type="button"
            onClick={handleDismiss}
            className="hidden sm:inline-flex items-center min-h-[44px] px-3 rounded-input text-meta-sm text-fg-muted hover:text-fg transition-colors"
            aria-label={t.homepage.close}
          >
            {t.homepage.notNow}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex sm:hidden items-center justify-center min-w-[44px] min-h-[44px] rounded-input text-fg-muted hover:text-fg transition-colors"
            aria-label={t.homepage.notNow}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
