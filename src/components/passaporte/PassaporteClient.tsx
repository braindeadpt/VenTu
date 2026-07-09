'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, LogIn, BookOpen, MapPinCheck } from 'lucide-react';
import { spots } from '@/lib/spots';
import { useAuth } from '@/contexts/AuthProvider';
import PassaporteBadge from '@/components/passaporte/PassaporteBadge';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';

interface Props {
  locale: string;
}

export default function PassaporteClient({ locale }: Props) {
  const loc = locale;
  const pt = loc === 'pt';
  const {
    session,
    authLoading,
    checkins,
    checkinsLoading,
    checkinsReady,
    isSupabaseReady,
    requestLogin,
  } = useAuth();

  const loading = authLoading || (session?.user && !checkinsReady) || checkinsLoading;

  if (!isSupabaseReady) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
        <p className="text-sm text-fg-muted text-center">
          {pt ? 'Passaporte indisponível (Supabase não configurado).' : 'Passport unavailable (Supabase not configured).'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base p-4">
        <div className="max-w-4xl mx-auto space-y-8 pt-8">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-[380px] w-full max-w-[520px] rounded-card mx-auto" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-bg-base pb-20">
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6">
          <BookOpen className="w-10 h-10 mx-auto text-data-waves" aria-hidden />
          <h1 className="text-h2 text-fg">{pt ? 'Passaporte VenTu' : 'VenTu Passport'}</h1>
          <p className="text-sm text-fg-muted">
            {pt
              ? 'Entra com o teu email para começar a marcar check-ins nos spots e ver o teu passaporte.'
              : 'Sign in with your email to start checking in at spots and see your passport.'}
          </p>
          <Button size="lg" onClick={() => requestLogin('general')}>
            {pt ? 'Entrar com magic link' : 'Sign in with magic link'}
          </Button>
          <Button href={`/${loc}/spots/`} variant="secondary" size="md" locale={loc as 'pt' | 'en'}>
            {pt ? 'Explorar spots' : 'Explore spots'}
          </Button>
        </div>
      </div>
    );
  }

  const checkedSpots = spots.filter((s) => checkins.includes(s.id));

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <Link href={`/${loc}/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
          <ArrowLeft className="w-4 h-4" />
          {pt ? 'Voltar' : 'Back'}
        </Link>

        <PageHeader
          icon={<BookOpen className="w-8 h-8 text-data-waves" aria-hidden />}
          title={pt ? 'Passaporte VenTu' : 'VenTu Passport'}
          subtitle={`${checkins.length} ${pt ? 'spots visitados' : 'spots visited'}`}
        />

        {checkins.length === 0 ? (
          <EmptyState
            icon={<MapPinCheck className="w-8 h-8 text-fg-subtle" aria-hidden />}
            title={pt ? 'Ainda sem check-ins' : 'No check-ins yet'}
            description={pt
              ? 'Faz check-in nos spots que visitas para veres o teu passaporte crescer.'
              : 'Check in at the spots you visit to grow your passport.'}
            action={
              <Button href={`/${loc}/spots/`} size="lg" locale={loc as 'pt' | 'en'}>
                {pt ? 'Explorar Spots' : 'Explore Spots'}
              </Button>
            }
          />
        ) : (
          <div className="space-y-8">
            <PassaporteBadge
              checkins={checkins}
              spots={spots}
              locale={loc}
              userName={session.user.email ?? undefined}
            />

            <div className="space-y-4">
              <h2 className="text-h3 font-display text-fg">
                {pt ? 'Spots visitados' : 'Visited spots'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {checkedSpots.map((spot) => (
                  <Link
                    key={spot.id}
                    href={`/${loc}/spots/${spot.slug}/`}
                    className="flex items-center gap-3 p-3 rounded-card border border-divider bg-surface-1/[0.04] hover:bg-surface-2/[0.08] transition-colors"
                  >
                    <MapPin className="w-5 h-5 shrink-0 text-sport-bodyboard" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg truncate">
                        {pt ? spot.name : spot.nameEn}
                      </p>
                      <p className="text-xs text-fg-subtle truncate">
                        {pt ? spot.region : spot.regionEn}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}