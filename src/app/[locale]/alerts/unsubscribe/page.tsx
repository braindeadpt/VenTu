'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AlertUnsubscribeClient from '@/components/alerts/AlertUnsubscribeClient';

export default function AlertUnsubscribePage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {locale === 'pt' ? 'A carregar…' : 'Loading…'}
      </div>
    );
  }

  return <AlertUnsubscribeClient locale={locale} token={token} />;
}
