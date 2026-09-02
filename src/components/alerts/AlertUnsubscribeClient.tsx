'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';

export default function AlertUnsubscribeClient({ locale, token }: { locale: string; token: string }) {
  const a = getTranslation(locale).alerts;
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    if (!token || !isSupabaseConfigured()) {
      setStatus('fail');
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setStatus('fail');
      return;
    }

     
    (sb as any).rpc('unsubscribe_alert_token', { p_token: token })
      .then(({ data, error }: { data: boolean | null; error: Error | null }) => {
        setStatus(error || data !== true ? 'fail' : 'ok');
      })
      .catch(() => setStatus('fail'));
  }, [token]);

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
      {status === 'loading' && (
        <p className="text-fg-muted">{a.cancelling}</p>
      )}
      {status === 'ok' && (
        <p className="text-lg text-fg font-semibold">
          {a.unsubscribed}
        </p>
      )}
      {status === 'fail' && (
        <p className="text-score-poor">{a.invalidLink}</p>
      )}
      <Link href={`/${locale}/`} className="text-data-waves underline underline-offset-2 hover:text-data-waves/80 text-sm">
        {a.backToVentu}
      </Link>
    </div>
  );
}
