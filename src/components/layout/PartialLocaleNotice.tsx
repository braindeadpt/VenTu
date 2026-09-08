'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { validateLocale, type Locale } from '@/lib/i18n';

/**
 * Honest banner for es/de/fr. The nav/meta/hreflang and the home hero, search
 * palette, compare and spot-detail bodies are localized, but most remaining
 * page bodies still render the EN branch (data strings are pt/en only).
 * Instead of letting hreflang alone promise full parity, es/de/fr visitors
 * get a dismissible notice. Never renders for pt/en.
 */
const STORAGE_KEY = 'ventu.partial-locale-dismissed';

const BODY: Record<Locale, string> = {
  pt: 'Página parcialmente traduzida — parte do conteúdo é mostrado em inglês.',
  en: 'Page partially translated — some content is shown in English.',
  es: 'Esta página aún no está totalmente traducida — parte del contenido se muestra en inglés.',
  de: 'Diese Seite ist noch nicht vollständig übersetzt — einige Inhalte werden auf Englisch angezeigt.',
  fr: "Cette page n'est pas encore entièrement traduite — une partie du contenu est affichée en anglais.",
};

const CLOSE: Record<Locale, string> = {
  pt: 'Fechar',
  en: 'Close',
  es: 'Cerrar',
  de: 'Schließen',
  fr: 'Fermer',
};

export default function PartialLocaleNotice({ locale }: { locale: string }) {
  const loc = validateLocale(locale);
  // Start dismissed (SSR + first client render agree) — localStorage is read
  // in an effect, so there is no hydration mismatch.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === loc);
    } catch {
      setDismissed(false);
    }
  }, [loc]);

  if (loc === 'pt' || loc === 'en' || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, loc);
    } catch {
      /* private mode — banner stays until navigation */
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label={BODY[loc]}
      data-partial-locale-notice={loc}
      className="flex items-center justify-center gap-3 px-4 py-2 text-xs bg-amber-500/10 border-b border-amber-500/25 text-amber-600"
    >
      <span aria-hidden>🌐</span>
      <span>{BODY[loc]}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={CLOSE[loc]}
        className="p-1 rounded hover:bg-amber-500/15 transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}