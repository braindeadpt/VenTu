'use client';

import { Search } from 'lucide-react';
import { dispatchOpenSearch } from '@/lib/searchEvents';
import { cn } from '@/lib/cn';

interface HomepageSearchProps {
  locale: string;
  /** Solid surface for use on top of the map hero (mobile legibility). */
  variant?: 'default' | 'hero';
}

export default function HomepageSearch({ locale, variant = 'default' }: HomepageSearchProps) {
  const isPt = locale === 'pt';
  const onHero = variant === 'hero';

  return (
    <button
      type="button"
      onClick={dispatchOpenSearch}
      className={cn(
        'inline-flex items-center gap-2 w-full sm:w-auto min-h-[44px] h-12 px-4 rounded-lg transition-colors duration-150',
        onHero
          ? 'bg-bg-base/95 backdrop-blur-md border border-divider-strong text-fg shadow-[0_2px_16px_rgba(0,0,0,0.28)] hover:bg-bg-base hover:border-divider-strong'
          : 'bg-surface-1/[0.04] border border-divider text-fg-subtle hover:border-divider-strong',
      )}
    >
      <Search className="w-4 h-4 shrink-0 text-fg-muted" aria-hidden />
      <span className={onHero ? 'font-medium' : undefined}>
        {isPt ? 'Procurar spot...' : 'Search spot...'}
      </span>
    </button>
  );
}
