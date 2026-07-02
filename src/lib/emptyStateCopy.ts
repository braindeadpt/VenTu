import { calmLabel, onLabel } from '@/lib/voice';

export type PlayfulEmptyVariant = 'flat-day' | 'no-spots-filter' | 'no-favorites' | 'no-top-now';

interface PlayfulEmptyCopy {
  title: string;
  description: string;
}

const COPY: Record<PlayfulEmptyVariant, { pt: PlayfulEmptyCopy; en: PlayfulEmptyCopy }> = {
  'flat-day': {
    pt: {
      title: `${calmLabel(true).charAt(0).toUpperCase()}${calmLabel(true).slice(1)} hoje 🪞`,
      description: 'Dia de SUP e cafés — o vento volta amanhã.',
    },
    en: {
      title: 'Glassy seas today 🪞',
      description: 'SUP and coffee day — wind returns tomorrow.',
    },
  },
  'no-top-now': {
    pt: {
      title: `Ninguém ${onLabel(true)} agora 😴`,
      description: `${calmLabel(true).charAt(0).toUpperCase()}${calmLabel(true).slice(1)} hoje 🪞 — dia de SUP e cafés. Vê o mapa na mesma.`,
    },
    en: {
      title: `Nothing ${onLabel(false)} right now 😴`,
      description: 'Glassy day — SUP and coffee. Still worth checking the map.',
    },
  },
  'no-spots-filter': {
    pt: {
      title: 'Nada por aqui 🌊',
      description: 'Experimenta outro desporto ou região — ou espera pela maré.',
    },
    en: {
      title: 'Nothing here 🌊',
      description: 'Try another sport or region — or wait for the tide.',
    },
  },
  'no-favorites': {
    pt: {
      title: 'Ainda sem favoritos 🤙',
      description: 'Entra e toca no coração num spot — sincroniza em todos os dispositivos.',
    },
    en: {
      title: 'No favorites yet 🤙',
      description: 'Sign in and tap the heart on a spot — syncs across all your devices.',
    },
  },
};

export function getPlayfulEmptyCopy(
  variant: PlayfulEmptyVariant,
  isPt: boolean,
): PlayfulEmptyCopy {
  return COPY[variant][isPt ? 'pt' : 'en'];
}
