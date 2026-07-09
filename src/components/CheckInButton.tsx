'use client';

import { useState } from 'react';
import { MapPinCheck, MapPin } from 'lucide-react';
import { useCheckins } from '@/contexts/AuthProvider';
import { useToast } from '@/components/ui/ToastProvider';

interface CheckInButtonProps {
  spotId: string;
  spotName: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  locale?: string;
}

export default function CheckInButton({
  spotId,
  spotName,
  size = 'md',
  showLabel = false,
  locale = 'pt',
}: CheckInButtonProps) {
  const { isCheckedIn, toggleCheckin, loaded, requestLogin, isSupabaseReady, isLoggedIn } = useCheckins();
  const { showToast } = useToast();
  const active = isCheckedIn(spotId);
  const isPt = locale === 'pt';
  const [clickEffect, setClickEffect] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (!loaded) {
    return <div className={`${sizeClasses[size]} animate-pulse bg-surface-1/[0.04] rounded`} />;
  }

  const handleClick = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn && !isSupabaseReady) {
      requestLogin('favorite');
      return;
    }

    if (!isLoggedIn) {
      requestLogin('favorite');
      return;
    }

    const wasCheckedIn = active;
    await toggleCheckin(spotId);
    if (!wasCheckedIn) {
      showToast(isPt ? 'Check-in feito!' : 'Check-in done!');
    }
    setClickEffect(true);
    setTimeout(() => setClickEffect(false), 300);
  };

  const label = !isLoggedIn
    ? isPt
      ? `Entrar para fazer check-in em ${spotName}`
      : `Sign in to check in at ${spotName}`
    : active
      ? isPt
        ? `Remover check-in de ${spotName}`
        : `Remove check-in from ${spotName}`
      : isPt
        ? ` Fazer check-in em ${spotName}`
        : `Check in at ${spotName}`;

  const Icon = active ? MapPinCheck : MapPin;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isLoggedIn ? active : undefined}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center min-w-[44px] min-h-[44px] p-2 rounded-lg transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-110 active:scale-95 ${
        clickEffect ? 'scale-[1.3]' : ''
      } ${
        active && isLoggedIn ? 'text-sport-bodyboard' : 'text-fg-subtle hover:text-fg-muted'
      }`}
    >
      <Icon
        className={`${sizeClasses[size]} transition-colors duration-200 motion-reduce:transition-none ${
          active && isLoggedIn ? 'fill-current' : 'fill-transparent'
        }`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-sm font-medium">
          {!isLoggedIn
            ? isPt
              ? 'Entrar'
              : 'Sign in'
            : active
              ? isPt
                ? 'Check-in feito'
                : 'Checked in'
              : isPt
                ? 'Já estive aqui'
                : 'Been here'}
        </span>
      )}
    </button>
  );
}