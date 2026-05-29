export type PlayfulEmptyVariant = 'flat-day' | 'no-spots-filter' | 'no-favorites' | 'no-top-now';

interface PlayfulEmptyCopy {
  title: string;
  description: string;
}

const COPY: Record<PlayfulEmptyVariant, { pt: PlayfulEmptyCopy; en: PlayfulEmptyCopy }> = {
  'flat-day': {
    pt: {
      title: 'Mar de espelho hoje 🪞',
      description: 'Dia de SUP e cafés — o vento volta amanhã.',
    },
    en: {
      title: 'Glassy seas today 🪞',
      description: 'SUP and coffee day — wind returns tomorrow.',
    },
  },
  'no-top-now': {
    pt: {
      title: 'Ninguém a bombar agora 😴',
      description: 'Mar de espelho hoje 🪞 — dia de SUP e cafés. Vê o mapa na mesma.',
    },
    en: {
      title: 'Nothing firing right now 😴',
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
      description: 'Toca no coração num spot — aparece aqui com condições frescas.',
    },
    en: {
      title: 'No favorites yet 🤙',
      description: 'Tap the heart on a spot — it shows up here with fresh conditions.',
    },
  },
};

export function getPlayfulEmptyCopy(
  variant: PlayfulEmptyVariant,
  isPt: boolean,
): PlayfulEmptyCopy {
  return COPY[variant][isPt ? 'pt' : 'en'];
}
