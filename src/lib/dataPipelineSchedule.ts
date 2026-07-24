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
  es: {
    short: '2h día · 4h noche',
    medium: 'actualizadas cada 2h (día) y cada 4h (noche)',
    long: 'Previsiones Open-Meteo cada 2h (06:00–20:00) y cada 4h por la noche (hora de Lisboa). Observaciones IH/IPMA entre medias.',
  },
} as const;

export function pipelineSchedule(locale: string, variant: 'short' | 'medium' | 'long' = 'medium'): string {
  const key = locale in PIPELINE_SCHEDULE ? (locale as keyof typeof PIPELINE_SCHEDULE) : 'en';
  return PIPELINE_SCHEDULE[key][variant];
}
