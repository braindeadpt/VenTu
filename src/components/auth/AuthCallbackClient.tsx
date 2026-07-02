'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export default function AuthCallbackClient({ locale }: { locale: string }) {
  const router = useRouter();
  const isPt = locale === 'pt';
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus('fail');
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setStatus('fail');
      return;
    }

    let cancelled = false;

    const finish = (ok: boolean) => {
      if (cancelled) return;
      setStatus(ok ? 'ok' : 'fail');
      if (ok) {
        router.replace(`/${locale}/favorites/`);
      }
    };

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) finish(true);
    });

    const timeout = window.setTimeout(() => {
      sb.auth.getSession().then(({ data: { session } }) => finish(!!session));
    }, 2500);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [locale, router]);

  return (
    <div className="max-w-md mx-auto py-20 px-4 text-center space-y-3">
      {status === 'loading' && (
        <p className="text-fg-muted">{isPt ? 'A confirmar entrada…' : 'Confirming sign-in…'}</p>
      )}
      {status === 'ok' && (
        <p className="text-fg">{isPt ? 'Entrada confirmada. A redirecionar…' : 'Signed in. Redirecting…'}</p>
      )}
      {status === 'fail' && (
        <>
          <p className="text-score-poor">
            {isPt ? 'Não foi possível confirmar a entrada.' : 'Could not confirm sign-in.'}
          </p>
          <a href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
            {isPt ? '← Voltar ao VenTu' : '← Back to VenTu'}
          </a>
        </>
      )}
    </div>
  );
}
