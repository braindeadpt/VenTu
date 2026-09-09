'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/contexts/AuthProvider';
import { useToast } from '@/components/ui/ToastProvider';

interface FavoriteButtonProps {
  spotId: string;
  spotName: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  locale?: string;
}

export { useFavorites } from '@/contexts/AuthProvider';

export default function FavoriteButton({
  spotId,
  spotName,
  size = 'md',
  showLabel = false,
  locale = 'pt',
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite, requestLogin, isSupabaseReady, isLoggedIn } = useFavorites();
  const { showToast } = useToast();
  const active = isFavorite(spotId);
  const isPt = locale === 'pt';
  const [clickEffect, setClickEffect] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Pre-hydration flash removed: the button SSRs for real and CSS hides it
  // until HydrationBeacon stamps .is-hydrated on <html> (see globals.css).
  // Auth state (isLoggedIn/favorites) still resolves async — until then the
  // resting state shows, identical in server and client markup.

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

    const wasFavorite = active;
    await toggleFavorite(spotId);
    if (!wasFavorite) {
      showToast(isPt ? 'Adicionado aos teus spots' : 'Added to your spots');
    }
    setClickEffect(true);
    setTimeout(() => setClickEffect(false), 300);
  };

  const label = !isLoggedIn
    ? isPt
      ? `Entrar para guardar ${spotName}`
      : `Sign in to save ${spotName}`
    : active
      ? isPt
        ? `Remover ${spotName} dos favoritos`
        : `Remove ${spotName} from favorites`
      : isPt
        ? `Adicionar ${spotName} aos favoritos`
        : `Add ${spotName} to favorites`;

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
        active && isLoggedIn ? 'text-windDir-onshore' : 'text-fg-subtle hover:text-fg-muted'
      }`}
    >
      <Heart
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
                ? 'Favorito'
                : 'Favorited'
              : isPt
                ? 'Favoritar'
                : 'Favorite'}
        </span>
      )}
    </button>
  );
}
