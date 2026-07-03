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
    sourcePt: 'IH',
    sourceEn: 'IH',
    detailPt: 'Maré observada · Instituto Hidrográfico',
    detailEn: 'Observed tide · Portuguese Hydrographic Institute',
  },
] as const;

export const HERO_PIPELINE_CADENCE_HOURS = 3;

export function getHeroCadenceLabel(locale: string): string {
  const isPt = locale === 'pt';
  return isPt ? `cada ${HERO_PIPELINE_CADENCE_HOURS}h` : `every ${HERO_PIPELINE_CADENCE_HOURS}h`;
}

export function getHeroCadenceTitle(locale: string): string {
  const isPt = locale === 'pt';
  return isPt
    ? `Pipeline automático: novas previsões a cada ${HERO_PIPELINE_CADENCE_HOURS} horas`
    : `Automated pipeline: new forecasts every ${HERO_PIPELINE_CADENCE_HOURS} hours`;
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
    ? `Última actualização do pipeline: ${when} (Lisboa). Ondas, vento e temperatura da água via Open-Meteo; marés observadas via IH.`
    : `Last pipeline update: ${when} (Lisbon). Waves, wind and water temperature via Open-Meteo; observed tides via IH.`;
}
