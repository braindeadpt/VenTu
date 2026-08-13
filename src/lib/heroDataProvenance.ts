/** User-facing forecast layers shown in the hero ticker (trust / provenance). */
export const HERO_FORECAST_LAYERS = [
  {
    key: 'waves',
    labelPt: 'Ondas',
    labelEn: 'Waves',
    sourcePt: 'Open-Meteo',
    sourceEn: 'Open-Meteo',
    detailPt: 'Marine API · ECMWF WAM, GFS Wave, GWAM',
    detailEn: 'Marine API · ECMWF WAM, GFS Wave, GWAM',
  },
  {
    key: 'wind',
    labelPt: 'Vento',
    labelEn: 'Wind',
    sourcePt: 'Open-Meteo',
    sourceEn: 'Open-Meteo',
    detailPt: 'Weather API · ECMWF IFS, GFS, Météo-France',
    detailEn: 'Weather API · ECMWF IFS, GFS, Météo-France',
  },
  {
    key: 'tides',
    labelPt: 'Marés',
    labelEn: 'Tides',
    sourcePt: 'Open-Meteo',
    sourceEn: 'Open-Meteo',
    detailPt: 'Previsão MSL · Open-Meteo Marine (marégrafo IH quando online)',
    detailEn: 'MSL forecast · Open-Meteo Marine (IH gauge when online)',
  },
] as const;

export const HERO_PIPELINE_CADENCE_HOURS = 2;

export function getHeroCadenceLabel(locale: string): string {
  const isPt = locale === 'pt';
  return isPt ? '2h dia · 4h noite' : '2h day · 4h night';
}

export function getHeroCadenceTitle(locale: string): string {
  const isPt = locale === 'pt';
  return isPt
    ? 'Previsões Open-Meteo: de 2h em 2h (06h–20h Lisboa) e de 4h em 4h de noite. Observações IH/IPMA nas horas intermédias.'
    : 'Open-Meteo forecasts: every 2h (06:00–20:00 Lisbon) and every 4h at night. IH/IPMA observations on in-between hours.';
}

export function getHeroFreshnessTitle(locale: string, updatedAtTs: number): string {
  const isPt = locale === 'pt';
  const loc = isPt ? 'pt-PT' : 'en-GB';
  const when = new Intl.DateTimeFormat(loc, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(updatedAtTs));

  return isPt
    ? `Última actualização do pipeline: ${when} (Lisboa). De dia: Open-Meteo com multi-modelo (2h). De noite: só best_match (4h). Marés previstas via Open-Meteo; observações IH quando o marégrafo está online.`
    : `Last pipeline update: ${when} (Lisbon). Daytime: Open-Meteo with multi-model (2h). Night: best_match only (4h). Forecast tides via Open-Meteo; IH observations when the gauge is online.`;
}
