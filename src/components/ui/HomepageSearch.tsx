'use client';

import { Search } from 'lucide-react';
import { dispatchOpenSearch } from '@/lib/searchEvents';

interface HomepageSearchProps {
  locale: string;
}

export default function HomepageSearch({ locale }: HomepageSearchProps) {
  const isPt = locale === 'pt';

  return (
    <button
      type="button"
      onClick={dispatchOpenSearch}
      className="inline-flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-surface-1/[0.04] border border-divider hover:border-divider-strong rounded-lg text-fg-subtle transition-colors duration-150"
    >
      <Search className="w-4 h-4 text-fg-muted" aria-hidden />
      <span>{isPt ? 'Procurar spot...' : 'Search spot...'}</span>
    </button>
  );
}
