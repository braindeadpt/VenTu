'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';

export default function AuthCallbackClient({ locale }: { locale: string }) {
  const router = useRouter();
  const t = getTranslation(locale).auth;
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

  // A página servida tinha 19 caracteres de conteúdo e nenhum <h1> (mega audit
  // 2026-09-26, achado A5): quem a abre directamente — link expirado, atalho do
  // browser — via texto solto, sem cabeçalho. O título passa a ser fixo (o
  // estado continua a ser a linha que muda, com as cores de antes).
  return (
    <div className="max-w-md mx-auto py-20 px-4 text-center space-y-3">
      <h1 className="font-display text-h2 text-fg">{t.titleDefault}</h1>
      <p className="text-fg-muted">{t.subtitleDefault}</p>
      {status === 'loading' && (
        <p className="text-fg-muted">{t.confirming}</p>
      )}
      {status === 'ok' && (
        <p className="text-fg">{t.confirmed}</p>
      )}
      {status === 'fail' && (
        <>
          <p className="text-score-poor">
            {t.failed}
          </p>
          <a href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
            {t.back}
          </a>
        </>
      )}
    </div>
  );
}
