'use client';

import { getTranslation } from '@/lib/i18n';
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
  const { isCheckedIn, toggleCheckin, requestLogin, isSupabaseReady, isLoggedIn } = useCheckins();
  const { showToast } = useToast();
  const active = isCheckedIn(spotId);
  const t = getTranslation(locale).checkIn;
  const isPt = locale === 'pt';
  const [clickEffect, setClickEffect] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Pre-hydration flash removed: CSS-gated like FavoriteButton (see globals.css).

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
      showToast(t.toastDone);
    }
    setClickEffect(true);
    setTimeout(() => setClickEffect(false), 300);
  };

  const label = (!isLoggedIn ? t.ariaSignIn : active ? t.ariaRemove : t.ariaDo).replace(
    '{name}',
    spotName,
  );

  const Icon = active ? MapPinCheck : MapPin;

  return (
    <button
      type="button"
      onClick={handleClick}
      data-hydration-gate="heart"
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
            ? getTranslation(locale).actions.signIn
            : active
              ? t.btnCheckedIn
              : t.btnBeenHere}
        </span>
      )}
    </button>
  );
}