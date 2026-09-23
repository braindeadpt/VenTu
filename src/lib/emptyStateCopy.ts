import { getTranslation } from '@/lib/i18n';

export type PlayfulEmptyVariant = 'flat-day' | 'no-spots-filter' | 'no-favorites' | 'no-top-now';

interface PlayfulEmptyCopy {
  title: string;
  description: string;
}

/** Micro-copy dos estados vazios — todo o texto vem do dicionário (5 línguas). */
export function getPlayfulEmptyCopy(
  variant: PlayfulEmptyVariant,
  locale: string,
): PlayfulEmptyCopy {
  const t = getTranslation(locale).emptyStates;
  switch (variant) {
    case 'flat-day':
      return { title: t.flatDayTitle, description: t.flatDayDesc };
    case 'no-top-now':
      return { title: t.noTopNowTitle, description: t.noTopNowDesc };
    case 'no-spots-filter':
      return { title: t.noSpotsTitle, description: t.noSpotsDesc };
    case 'no-favorites':
      return { title: t.noFavTitle, description: t.noFavDesc };
  }
}
