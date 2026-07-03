/** User-facing copy for the Lisbon-aware data pipeline schedule. */
export const PIPELINE_SCHEDULE = {
  pt: {
    short: '2h dia · 4h noite',
    medium: 'actualizadas de 2h em 2h (dia) e de 4h em 4h (noite)',
    long: 'Previsões Open-Meteo de 2h em 2h (06h–20h) e de 4h em 4h de noite (hora Lisboa). Observações IH/IPMA nas horas intermédias.',
  },
  en: {
    short: '2h day · 4h night',
    medium: 'updated every 2h (daytime) and 4h (night)',
    long: 'Open-Meteo forecasts every 2h (06:00–20:00) and every 4h at night (Lisbon time). IH/IPMA observations in between.',
  },
} as const;

export function pipelineSchedule(locale: string, variant: 'short' | 'medium' | 'long' = 'medium'): string {
  const loc = locale === 'pt' ? 'pt' : 'en';
  return PIPELINE_SCHEDULE[loc][variant];
}
