import { calmLabel, onLabel } from '@/lib/voice';
import { validateLocale, type Locale } from '@/lib/i18n';

export type PlayfulEmptyVariant = 'flat-day' | 'no-spots-filter' | 'no-favorites' | 'no-top-now';

interface PlayfulEmptyCopy {
  title: string;
  description: string;
}

const COPY: Record<PlayfulEmptyVariant, Record<Locale, PlayfulEmptyCopy>> = {
  'flat-day': {
    pt: {
      title: `${calmLabel(true).charAt(0).toUpperCase()}${calmLabel(true).slice(1)} hoje 🪞`,
      description: 'Dia de SUP e cafés — o vento volta amanhã.',
    },
    en: {
      title: 'Glassy seas today 🪞',
      description: 'SUP and coffee day — wind returns tomorrow.',
    },
    es: {
      title: 'Mar de espejo hoy 🪞',
      description: 'Día de SUP y café — el viento vuelve mañana.',
    },
    de: {
      title: 'Glattes Wasser heute 🪞',
      description: 'SUP- und Kaffee-Tag — der Wind kommt morgen zurück.',
    },
    fr: {
      title: 'Mer d’huile aujourd’hui 🪞',
      description: 'Journée SUP et café — le vent revient demain.',
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
    es: {
      title: 'Nadie a tope ahora 😴',
      description: 'Mar de espejo hoy 🪞 — día de SUP y café. Mira el mapa igual.',
    },
    de: {
      title: 'Gerade nichts am Laufen 😴',
      description: 'Glattes Wasser heute 🪞 — SUP und Kaffee. Die Karte lohnt trotzdem.',
    },
    fr: {
      title: 'Rien à fond pour l’instant 😴',
      description: 'Mer d’huile aujourd’hui 🪞 — journée SUP et café. La carte vaut quand même le détour.',
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
    es: {
      title: 'Nada por aquí 🌊',
      description: 'Prueba otro deporte o región — o espera a la marea.',
    },
    de: {
      title: 'Nichts hier 🌊',
      description: 'Anderen Sport oder Region versuchen — oder auf die Tide warten.',
    },
    fr: {
      title: 'Rien par ici 🌊',
      description: 'Essaie un autre sport ou une autre région — ou attends la marée.',
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
    es: {
      title: 'Aún sin favoritos 🤙',
      description: 'Entra y toca el corazón en un spot — se sincroniza en todos tus dispositivos.',
    },
    de: {
      title: 'Noch keine Favoriten 🤙',
      description: 'Anmelden und Herz bei einem Spot tippen — sync auf allen Geräten.',
    },
    fr: {
      title: 'Pas encore de favoris 🤙',
      description: 'Connecte-toi et touche le cœur sur un spot — sync sur tous tes appareils.',
    },
  },
};

/**
 * Playful empty-state copy. Accepts boolean (legacy isPt) or locale string.
 */
export function getPlayfulEmptyCopy(
  variant: PlayfulEmptyVariant,
  localeOrIsPt: boolean | string,
): PlayfulEmptyCopy {
  const locale: Locale =
    typeof localeOrIsPt === 'boolean'
      ? localeOrIsPt
        ? 'pt'
        : 'en'
      : validateLocale(localeOrIsPt);
  return COPY[variant][locale];
}
