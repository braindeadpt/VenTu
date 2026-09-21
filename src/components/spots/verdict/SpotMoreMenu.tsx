'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import SocialShare from '@/components/ui/SocialShare';
import CheckInButton from '@/components/CheckInButton';

/**
 * Menu «Mais» do veredicto — Partilhar + Check-in. Popover acessível:
 * aria-expanded/aria-controls no botão, Esc fecha e devolve o foco ao botão,
 * clique fora fecha. Alvos ≥44 px.
 */
export default function SpotMoreMenu({
  label,
  menuLabel,
  shareLabel,
  shareTitle,
  spotId,
  spotName,
  locale,
}: {
  /** Texto do botão («Mais»). */
  label: string;
  /** aria-label do grupo popover. */
  menuLabel: string;
  /** Etiqueta visível junto ao SocialShare. */
  shareLabel: string;
  /** Título partilhado (nome do spot · região). */
  shareTitle: string;
  spotId: string;
  spotName: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-input border border-divider-strong text-meta-sm font-medium text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors duration-150"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden />
        {label}
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label={menuLabel}
          className="absolute right-0 top-full mt-1 z-50 card-2 rounded-card border border-divider p-2 min-w-[180px] flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 min-h-[44px] px-1">
            <SocialShare title={shareTitle} locale={locale} />
            <span className="text-meta-sm text-fg">{shareLabel}</span>
          </div>
          <CheckInButton
            spotId={spotId}
            spotName={spotName}
            size="md"
            showLabel
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
