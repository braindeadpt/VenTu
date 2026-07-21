'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AlertConfirmClient from '@/components/alerts/AlertConfirmClient';

export default function AlertConfirmPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const isPt = locale === 'pt';
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  if (token === null) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center text-fg-muted text-sm">
        {isPt ? 'A carregar…' : 'Loading…'}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <p className="text-score-poor text-sm">
          {isPt ? 'Link inválido ou incompleto (falta o token).' : 'Invalid or incomplete link (missing token).'}
        </p>
        <Link href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
          {isPt ? '← Voltar ao VenTu' : '← Back to VenTu'}
        </Link>
      </div>
    );
  }

  return <AlertConfirmClient locale={locale} token={token} />;
}
