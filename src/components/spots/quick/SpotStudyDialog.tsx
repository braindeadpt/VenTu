'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

/**
 * Placeholder acessível do «Estudar o spot» (#184): um `<button>` simples
 * no HTML estático abre este diálogo. O mapa detalhado (fundo, bancos,
 * orientação da costa) é a issue #186 — até lá, o diálogo explica o que
 * aí vem. Esc fecha, o foco volta ao botão que abriu.
 */
export default function SpotStudyDialog({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Foco inicial no painel (role=dialog + tabIndex=-1).
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-bg-base/80" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={tq.studyTitle}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-card border border-divider bg-bg-elevated p-5 shadow-card outline-none"
        data-study-dialog
      >
        <h2 className="font-display text-lg font-semibold text-fg">
          {tq.studyTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {tq.studySoon}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={tq.close}
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-input border border-divider text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors duration-150"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
