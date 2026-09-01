'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AlertConfirmClient from '@/components/alerts/AlertConfirmClient';
import { getTranslation } from '@/lib/i18n';

export default function AlertConfirmPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const a = getTranslation(locale).alerts;
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  if (token === null) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {getTranslation(locale).common.loading}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <p className="text-score-poor text-sm">{a.invalidToken}</p>
        <Link href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
          {a.backToVentu}
        </Link>
      </div>
    );
  }

  return <AlertConfirmClient locale={locale} token={token} />;
}
