/**
 * VenTu data sources — limits and call budget (audit reference for workflows).
 * Open-Meteo counts weighted API calls (variables × timesteps × models), not just HTTP requests.
 * @see https://open-meteo.com/en/pricing
 */

/** @typedef {'limited' | 'generous' | 'internal'} SourceTier */

/** @typedef {{ id: string; name: string; tier: SourceTier; usedFor: string; callsPerFullRun: string; limits: string; notes: string }} DataSourceRow */

/** @type {DataSourceRow[]} */
const DATA_SOURCES = [
  {
    id: 'open-meteo-marine',
    name: 'Open-Meteo Marine API',
    tier: 'limited',
    usedFor: 'Ondas, swell, temperatura da água, maré modelada, previsão horária',
    callsPerFullRun: '~170 spots × 2 pedidos (best_match + multi-modelo) ≈ 1.5k–3k chamadas ponderadas',
    limits: '10 000/dia · 5 000/h · 600/min (grátis, não comercial)',
    notes: 'Gargalo principal — agenda 2h (dia) / 4h (noite). 200ms entre spots.',
  },
  {
    id: 'open-meteo-weather',
    name: 'Open-Meteo Weather API',
    tier: 'limited',
    usedFor: 'Vento, rajadas, previsão horária + blend ICON-EU no score',
    callsPerFullRun: '~170 spots × 2 pedidos (best_match + multi-modelo c/ ICON-EU)',
    limits: 'Mesmo quota IP que Marine',
    notes: 'Dia (06–20h): 4 HTTP/spot com multi-modelo. Blend floor ICON-EU no vento do score. Noite: 2 HTTP/spot só best_match.',
  },
  {
    id: 'ih-tides',
    name: 'IH OGC API (Hidrográfico)',
    tier: 'generous',
    usedFor: 'Maré observada, estações NRT',
    callsPerFullRun: '1 pedido (lista de estações)',
    limits: 'Serviço público — sem quota documentada no pipeline',
    notes: 'Pode correr em refreshes só de observações.',
  },
  {
    id: 'ipma',
    name: 'IPMA open data',
    tier: 'generous',
    usedFor: 'Observações meteorológicas (vento real)',
    callsPerFullRun: '1–2 pedidos',
    limits: 'Open data — uso moderado',
    notes: 'Camada observed em conditions.json; merge sem Open-Meteo.',
  },
  {
    id: 'ecowitt',
    name: 'Ecowitt Cloud API',
    tier: 'generous',
    usedFor: 'PWS observada (quando configurada)',
    callsPerFullRun: '2 pedidos (device info + real_time)',
    limits: 'Conta própria — baixo volume',
    notes: 'Opcional via secrets; falha não bloqueia pipeline.',
  },
  {
    id: 'metar',
    name: 'Aviation Weather METAR',
    tier: 'generous',
    usedFor: 'Vento observado em aeroportos (fallback costeiro/ilhas)',
    callsPerFullRun: '1 pedido batch (ICAO PT)',
    limits: 'API pública NOAA/AWC — uso moderado',
    notes: 'Aeroporto ≠ térmico de praia; preferido só se mais perto ou sem IPMA/Ecowitt.',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    tier: 'internal',
    usedFor: 'Cron, build índice, push',
    callsPerFullRun: '1 job',
    limits: 'Minutos free tier do repo',
    notes: 'Full run ~6–8 min; obs-only ~1 min.',
  },
];

/** Primary spots fetched from API (excludes conditionsSource aliases). */
const PRIMARY_SPOT_COUNT_ESTIMATE = 170;
const HTTP_REQUESTS_PER_SPOT_FULL = 4;

/**
 * Rough weighted Open-Meteo calls per full pipeline run.
 * Conservative for quota planning.
 */
const OPEN_METEO_WEIGHTED_PER_RUN_ESTIMATE = 2800;

/** @type {Record<string, { dayRuns: number; nightRuns: number; obsOnlyRuns: number; openMeteoPerDay: number }>} */
const SCHEDULE_BUDGET = {
  /** 06–20h a cada 2h + 00h e 04h + obs ímpares 07–19h */
  proposed: {
    dayRuns: 8,
    nightRuns: 2,
    obsOnlyRuns: 7,
    openMeteoPerDay: 10,
  },
  /** legado uniforme 3h */
  legacy3h: {
    dayRuns: 0,
    nightRuns: 0,
    obsOnlyRuns: 0,
    openMeteoPerDay: 8,
  },
};

function estimatedOpenMeteoDaily(runCount) {
  return runCount * OPEN_METEO_WEIGHTED_PER_RUN_ESTIMATE;
}

function printAuditSummary() {
  console.log('── VenTu data pipeline audit ──\n');
  for (const row of DATA_SOURCES) {
    console.log(`[${row.tier.toUpperCase()}] ${row.name}`);
    console.log(`  Uso: ${row.usedFor}`);
    console.log(`  Volume: ${row.callsPerFullRun}`);
    console.log(`  Limites: ${row.limits}`);
    console.log(`  Notas: ${row.notes}\n`);
  }
  const p = SCHEDULE_BUDGET.proposed;
  const daily = estimatedOpenMeteoDaily(p.openMeteoPerDay);
  console.log('── Agenda proposta (hora Lisboa) ──');
  console.log(`  Open-Meteo: ${p.dayRuns}× dia (multi-modelo) + ${p.nightRuns}× noite (só best_match, −50% pedidos)`);
  console.log(`  Só observações (IH+IPMA+Ecowitt): ${p.obsOnlyRuns}× dia (07–19, horas ímpares)`);
  console.log(`  Open-Meteo estimado/dia: ~${daily.toLocaleString('en')} chamadas ponderadas (limite 10 000)`);
  console.log(`  HTTP/spot (full): ${HTTP_REQUESTS_PER_SPOT_FULL} · spots primários ~${PRIMARY_SPOT_COUNT_ESTIMATE}`);
}

module.exports = {
  DATA_SOURCES,
  SCHEDULE_BUDGET,
  PRIMARY_SPOT_COUNT_ESTIMATE,
  HTTP_REQUESTS_PER_SPOT_FULL,
  OPEN_METEO_WEIGHTED_PER_RUN_ESTIMATE,
  estimatedOpenMeteoDaily,
  printAuditSummary,
};
