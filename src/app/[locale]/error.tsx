'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ErrorState from '@/components/ui/ErrorState';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() || '';
  const locale = pathname.startsWith('/en') ? 'en' : 'pt';

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <ErrorState locale={locale} onRetry={reset} />
    </div>
  );
}
