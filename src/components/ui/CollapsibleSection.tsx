'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Accordion behaviour (mobile). Children are always in the DOM (native
      <details> hides them when closed) — keeps headings/maps crawlable. */
  collapsible?: boolean;
  /** Initial open state when collapsible (e.g. safety info). */
  defaultOpen?: boolean;
  /** Âncora alvo (`#id`) — um chip do hero aponta aqui e a secção abre-se
      sozinha em mobile (audit 2026-09-16 P2, ex.: câmara ao vivo). */
  anchorId?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Secção de rail — card com título em desktop, accordion em mobile. Mantém a
 * mesma ordem de conteúdo nos dois modos; o título vive aqui para não haver
 * cabeçalhos duplicados dentro dos filhos (que usam `embedded`).
 */
export default function CollapsibleSection({
  title,
  icon,
  collapsible,
  defaultOpen,
  anchorId,
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  // Navegação por âncora: se a hash apontar a esta secção, abre-a (o browser
  // faz scroll para o <summary>, que está sempre montado).
  useEffect(() => {
    if (!collapsible || !anchorId) return;
    const sync = () => {
      if (window.location.hash === `#${anchorId}`) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [collapsible, anchorId]);

  if (collapsible) {
    return (
      <details
        id={anchorId}
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className={`group rounded-card border border-divider bg-surface-1/[0.03] overflow-hidden scroll-mt-20 ${className ?? ''}`}
      >
        <summary className="flex items-center gap-2 px-4 min-h-[48px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
          {icon}
          <span className="flex-1 text-h3 text-fg">{title}</span>
          <ChevronDown
            className="w-4 h-4 text-fg-muted transition-transform duration-150 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        {/* Filhos sempre montados: o <details> nativo esconde-os quando
            fechado, mas mantêm-se na árvore (SEO/a11y/crawler). */}
        <div className="px-3 pb-3 pt-2 border-t border-divider">{children}</div>
      </details>
    );
  }

  return (
    <section id={anchorId} className={`card-1 p-3 md:p-4 scroll-mt-20 ${className ?? ''}`}>
      <h2 className="text-h3 text-fg flex items-center gap-2 mb-2.5">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
