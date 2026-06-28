'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ErrorState from '@/components/ui/ErrorState';
import { localeFromPathname } from '@/lib/i18n';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() || '';
  const locale = localeFromPathname(pathname);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <ErrorState locale={locale} onRetry={reset} />
    </div>
  );
}
