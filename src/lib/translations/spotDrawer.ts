/** SpotDrawer — labels dos separadores («Agora», «7 dias», «Janelas», «Sazonalidade»). */
export const spotDrawerTabs = {
  pt: {
    now: 'Agora',
    '7d': '7 dias',
    windows: 'Janelas',
    seasonality: 'Sazonalidade',
  },
  en: {
    now: 'Now',
    '7d': '7 days',
    windows: 'Windows',
    seasonality: 'Seasonality',
  },
  es: {
    now: 'Ahora',
    '7d': '7 días',
    windows: 'Ventanas',
    seasonality: 'Estacionalidad',
  },
  de: {
    now: 'Jetzt',
    '7d': '7 Tage',
    windows: 'Fenster',
    seasonality: 'Saisonalität',
  },
  fr: {
    now: 'Maintenant',
    '7d': '7 jours',
    windows: 'Fenêtres',
    seasonality: 'Saisonnalité',
  },
};

export type SpotDrawerTabId = keyof (typeof spotDrawerTabs)['pt'];
