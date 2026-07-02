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
  const { isFavorite, toggleFavorite, loaded, mounted, requestLogin, isSupabaseReady, isLoggedIn } = useFavorites();
  const { showToast } = useToast();
  const active = isFavorite(spotId);
  const isPt = locale === 'pt';
  const [clickEffect, setClickEffect] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (!mounted || !loaded) {
    return <div className={`${sizeClasses[size]} animate-pulse bg-surface-1/[0.04] rounded`} />;
  }

  const handleClick = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSupabaseReady) {
      showToast(isPt ? 'Favoritos indisponíveis' : 'Favorites unavailable');
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
      aria-pressed={isLoggedIn ? active : undefined}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center min-w-[44px] min-h-[44px] p-2 rounded-lg transition-all hover:scale-110 ${
        clickEffect ? 'scale-125' : ''
      } ${
        active && isLoggedIn ? 'text-windDir-onshore' : 'text-fg-subtle hover:text-fg-muted'
      }`}
    >
      <Heart
        className={`${sizeClasses[size]} ${active && isLoggedIn ? 'fill-current' : ''}`}
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
