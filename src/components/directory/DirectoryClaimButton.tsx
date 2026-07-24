'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchMyClaimForEntry, submitDirectoryClaim } from '@/lib/directoryClaims';
import Button from '@/components/ui/Button';

type Props = {
  entryId: string;
  entryName: string;
  locale: string;
};

export default function DirectoryClaimButton({ entryId, entryName, locale }: Props) {
  const isPt = locale === 'pt';
  const { session, authLoading, requestLogin, isSupabaseReady } = useAuth();
  const [status, setStatus] = useState<'idle' | 'pending' | 'approved' | 'rejected' | 'loading'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');

  useEffect(() => {
    if (!session?.user || !isSupabaseReady) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    void fetchMyClaimForEntry(sb, session.user.id, entryId).then((row) => {
      if (row) setStatus(row.status);
    });
  }, [session?.user, entryId, isSupabaseReady]);

  const onClaim = async () => {
    if (!isSupabaseReady) {
      setMessage(isPt ? 'Auth indisponível de momento.' : 'Auth unavailable right now.');
      return;
    }
    if (!session?.user) {
      requestLogin();
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;

    setStatus('loading');
    setMessage(null);
    const res = await submitDirectoryClaim(sb, {
      entryId,
      userId: session.user.id,
      evidence: evidence.trim() || undefined,
      contactEmail: session.user.email ?? undefined,
    });

    if (!res.ok) {
      setStatus('idle');
      const missingTable =
        /relation .*directory_claims.* does not exist|Could not find the table/i.test(res.error);
      setMessage(
        missingTable
          ? isPt
            ? 'Claims ainda não activos na base — corre supabase-directory.sql.'
            : 'Claims not enabled yet — run supabase-directory.sql.'
          : res.error,
      );
      return;
    }
    setStatus('pending');
    setMessage(
      isPt
        ? 'Pedido enviado. Confirmamos por email quando estiver verificado.'
        : 'Request sent. We’ll email you when it’s verified.',
    );
  };

  if (status === 'approved') {
    return (
      <p className="text-meta-sm text-score-good">
        {isPt ? 'Perfil verificado — és o dono.' : 'Verified profile — you own this.'}
      </p>
    );
  }

  if (status === 'pending') {
    return (
      <p className="text-meta-sm text-fg-muted">
        {isPt
          ? `Pedido de reivindicação para «${entryName}» em análise.`
          : `Claim for “${entryName}” under review.`}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-meta-sm text-fg-muted">
          {isPt
            ? 'Prova opcional (site, IG, NIF, telefone…)'
            : 'Optional proof (site, IG, tax ID, phone…)'}
        </span>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          placeholder={isPt ? 'Ex.: sou o dono de @escola…' : 'e.g. I own @school…'}
        />
      </label>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void onClaim()}
        disabled={authLoading || status === 'loading'}
      >
        {session?.user
          ? isPt
            ? 'Reclamar este perfil'
            : 'Claim this profile'
          : isPt
            ? 'Entrar para reclamar'
            : 'Sign in to claim'}
      </Button>
      {message && <p className="text-meta-sm text-fg-muted">{message}</p>}
    </div>
  );
}
