/** spotPageForecast — secção 5 da página de spot (S3/SP-B): previsão hora a hora. */
export const spotPageForecast = {
  pt: {
    sectionTitle: 'Previsão',
    /** Título da secção (SPOT-UX-V3 §5) — igual à âncora. */
    hourlyTitle: 'Hora a hora',
    /** Lista mobile — paginação de 24 em 24 h. */
    showMore24: 'Mostrar mais 24 h',
    // Fase da maré na linha mobile («↑ a encher»)
    tideRising: 'a encher',
    tideFalling: 'a vazar',
    tideHigh: 'preia-mar',
    tideLow: 'baixa-mar',
  },
  en: {
    sectionTitle: 'Forecast',
    hourlyTitle: 'Hour by hour',
    showMore24: 'Show 24 more hours',
    tideRising: 'rising',
    tideFalling: 'falling',
    tideHigh: 'high tide',
    tideLow: 'low tide',
  },
  es: {
    sectionTitle: 'Previsión',
    hourlyTitle: 'Hora por hora',
    showMore24: 'Mostrar 24 h más',
    tideRising: 'subiendo',
    tideFalling: 'bajando',
    tideHigh: 'pleamar',
    tideLow: 'bajamar',
  },
  de: {
    sectionTitle: 'Vorhersage',
    hourlyTitle: 'Stündlich',
    showMore24: '24 h mehr zeigen',
    tideRising: 'steigend',
    tideFalling: 'fallend',
    tideHigh: 'Hochwasser',
    tideLow: 'Niedrigwasser',
  },
  fr: {
    sectionTitle: 'Prévisions',
    hourlyTitle: 'Heure par heure',
    showMore24: 'Afficher 24 h de plus',
    tideRising: 'montante',
    tideFalling: 'descendante',
    tideHigh: 'pleine mer',
    tideLow: 'basse mer',
  },
} as const;
