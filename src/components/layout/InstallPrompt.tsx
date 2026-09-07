'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';

const VISITS_KEY = 'ventu:visit-count';
const DISMISS_KEY = 'ventu:install-dismissed-until';
const MIN_VISITS = 3;
const DISMISS_DAYS = 14;
/** Wait for scroll so the banner never covers a spot-detail hero (score/metrics). */
const SCROLL_REVEAL_PX = 280;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isSpotDetailPath(pathname: string): boolean {
  return /\/spots\/[^/]+\/?$/.test(pathname);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [locale, setLocale] = useState<'pt' | 'en'>('pt');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const path = window.location.pathname;
    setLocale(path.startsWith('/en') ? 'en' : 'pt');

    try {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedUntil > Date.now()) return;

      const visits = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      if (visits < MIN_VISITS) return;
    } catch {
      return;
    }

    setEligible(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!eligible) return;

    const path = window.location.pathname;
    const needsScroll = isSpotDetailPath(path);

    const reveal = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (!needsScroll || y >= SCROLL_REVEAL_PX) {
        setScrolledEnough(true);
      }
    };

    reveal();
    if (scrolledEnough) return;

    window.addEventListener('scroll', reveal, { passive: true });
    return () => window.removeEventListener('scroll', reveal);
  }, [eligible, scrolledEnough]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch { /* noop */ }
    setDeferred(null);
    setEligible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setEligible(false);
  };

  const visible = eligible && scrolledEnough && deferred;
  if (!visible) return null;

  const isPt = locale === 'pt';

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-40 card-2 p-4 shadow-lg border border-divider-strong mb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-label={isPt ? 'Instalar VenTu' : 'Install VenTu'}
      data-install-prompt="true"
    >
      <div className="flex gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-data-waves/15 flex items-center justify-center">
          <Download className="w-5 h-5 text-data-waves" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg">
            {isPt ? 'Instala o VenTu' : 'Install VenTu'}
          </p>
          <p className="text-xs text-fg-muted mt-0.5">
            {isPt
              ? `Acesso rápido às condições — previsões ${pipelineSchedule('pt')}.`
              : `Quick access to conditions — forecasts ${pipelineSchedule('en')}.`}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={install}
              className="flex-1 h-9 px-3 rounded-lg bg-data-waves/20 text-data-waves text-sm font-medium hover:bg-data-waves/30 transition-colors"
            >
              {isPt ? 'Instalar' : 'Install'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="h-9 px-3 rounded-lg text-fg-muted text-sm hover:bg-surface-2/[0.08] transition-colors"
            >
              {isPt ? 'Agora não' : 'Not now'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-1 text-fg-subtle hover:text-fg"
          aria-label={isPt ? 'Fechar' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
