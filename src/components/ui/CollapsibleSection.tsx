'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Accordion behaviour (mobile). Children mount lazily on first open —
      maps/iframes only pay their cost when the user expands the section. */
  collapsible?: boolean;
  /** Initial open state when collapsible (e.g. safety info). */
  defaultOpen?: boolean;
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
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  if (collapsible) {
    return (
      <details
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className={`group rounded-card border border-divider bg-surface-1/[0.03] overflow-hidden ${className ?? ''}`}
      >
        <summary className="flex items-center gap-2 px-4 min-h-[48px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
          {icon}
          <span className="flex-1 text-h3 text-fg">{title}</span>
          <ChevronDown
            className="w-4 h-4 text-fg-muted transition-transform duration-150 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        {open && <div className="px-3 pb-3 pt-2 border-t border-divider">{children}</div>}
      </details>
    );
  }

  return (
    <section className={`card-1 p-3 md:p-4 ${className ?? ''}`}>
      <h2 className="text-h3 text-fg flex items-center gap-2 mb-2.5">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
