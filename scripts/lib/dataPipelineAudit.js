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
    callsPerFullRun: '~181 spots × 10 ponderadas (multi-modelo: 4 ondas + 4 vento + 2 best_match) ≈ 1.8k · best_match ≈ 0.4k',
    limits: '10 000/dia · 5 000/h · 600/min (grátis, não comercial)',
    notes: 'Gargalo principal. Multi-modelo 3×/dia (06/12/18) para caber nos 10k (run inteiro 2h = 1.8k; 8–9 runs = 15–17k — acima). Health-check em lib/modelHealth.js (report model-health.json + alerta Telegram na transição para morto).',
  },
  {
    id: 'open-meteo-weather',
    name: 'Open-Meteo Weather API',
    tier: 'limited',
    usedFor: 'Vento, rajadas, previsão horária + blend ICON-EU no score',
    callsPerFullRun: '~170 spots × 2 pedidos (best_match + multi-modelo c/ ICON-EU)',
    limits: 'Mesmo quota IP que Marine',
    notes: 'Dia (06–20h): 4 HTTP/spot com multi-modelo. Blend floor ICON-EU no vento do score. Noite: 2 HTTP/spot só best_match. Ensemble vento: ICON-EU + IFS 0.25 + GFS + ARPEGE (+ AIFS só com VENTU_WIND_AIFS=1 — hoje devolve null no grátis).',
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
    id: 'ih-buoys',
    name: 'IH Datawell Waverider buoys',
    tier: 'generous',
    usedFor: 'Onda observada (altura significativa, período/direcção de pico, hmax, SST)',
    callsPerFullRun: '1 pedido (estações) + 1 pedido/boia ativa (só com IH_API_KEY)',
    limits: 'Chave gratuita (X-API-KEY); séries limitadas a 15 dias',
    notes: 'Backend diferente das marés — mantém-se OK quando tide_obs_nrt 500. Sem key: só estações, observedWave salta.',
  },
  {
    id: 'wmo-buoys',
    name: 'Copernicus Marine WMO buoys (S3, keyless)',
    tier: 'generous',
    usedFor: 'Onda observada fallback (Hs, período, direcção, SST) via rota WMO/GTS independente',
    callsPerFullRun: '1–2 listings S3 + 1 download/boia encontrada (~7)',
    limits: 'Bucket público, sem key — uso moderado',
    notes: 'Cataloga Datawell PT (6201077/79) + Puertos del Estado ES (6200024/25, 6200083–85 — voltaram a reportar 2026-08). Merge: IH primário, WMO fallback (gate 6h vs 3h). Parse NetCDF-4 com h5wasm (WASM puro).',
  },
  {
    id: 'copernicus-coherence',
    name: 'Coerência cross-border de boias (Copernicus S3, sem key)',
    tier: 'free',
    usedFor: 'Validação: boias ES (Cabo Silleiro/Villano) vs PT (Porto/Faro) nas horas sobrepostas → buoy-coherence.json (n, mean|Δ|, ME, max, r, veredicto) + auditoria por região do observedWave (fonte anexada vs boia mais próxima, escrita pelo merge)',
    callsPerFullRun: 'Re-download dos 4 NetCDF do dia (mesmos ficheiros do fetch WMO) — 4 GETs S3 pequenos',
    limits: 'Bucket público, sem key',
    notes: 'Veredicto coherent/review/incoherent/insufficient por par (limiares mean|Δ| 0.8/1.5 m, n≥3). Pares horários acumulam dia a dia em buoy-coherence-archive.json (janela 30 dias) — n suficiente mesmo com as boias PT esparsas; os veredictos vêm da acumulação. Sem dados: mantém relatório anterior, exit 0. Bloco regions: por região, vencedor por fonte + attachedIsClosest/attachedNotClosest (anomalias em notClosest) + calibrated/calibrationRefs (referência PT escolhida na calibração ES→PT, com par/ME/n/spots).',
  },
  {
    id: 'open-meteo-historical',
    name: 'Open-Meteo Historical Marine (ERA5)',
    tier: 'generous',
    usedFor: 'Skill/bias de onda: ERA5 vs boias → wave-bias.json (ME/MAE/RMSE/r por boia e região) — IH Datawell + boias ES da Copernicus (WMO, sem key)',
    callsPerFullRun: '1 pedido/boia (IH: com key; ES: sem key — Silleiro/Villano/Bilbao/Peñas/Cádiz)',
    limits: 'Sem key; ~312h/boia/janela de 13 dias',
    notes: 'Boias ES reportam à Copernicus só em latest/<dia> — as leituras acumulam em wmo-bias-archive.json (dedup por hora UTC) até N≥30. past_days devolve o backfill ERA5 — não há skill real. Correcção opt-in (VENTU_WAVE_BIAS_CORRECTION=1, N≥30, |ME|≥0.15 m). Gate cross-border: par ES×PT incoherent no buoy-coherence.json → bias da boia ES não atribuído a regiões (regionAttribution=false).',
  },
  {
    id: 'forecast-skill',
    name: 'Forecast skill (best_match vs boias IH + ES/WMO, arquivo)',
    tier: 'free',
    usedFor: 'Skill real do forecast: ME/MAE/RMSE/r acumulados run a run → forecast-skill.json (distinto do wave-bias/ERA5)',
    callsPerFullRun: '0 pedidos Open-Meteo novos (reutiliza forecasts.json); 1 pedido IH por boia ativa (48h) com IH_API_KEY; boias ES via wmo-bias-archive.json (sem key)',
    limits: 'Sem custo extra de quota Open-Meteo',
    notes: 'Arquiva previsões futuras (runAt) + observações; pares com lead time > 0. Boias ES (Silleiro/Villano/Cádiz/…) ingeridas do wmo-bias-archive — pares ES formam-se mesmo sem key.',
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
    id: 'wind-bias',
    name: 'Wind bias por estação (derivado — sem API nova)',
    tier: 'free',
    usedFor: 'Transparência do vento observado: ME/MAE/RMSE/n da estação (IPMA/Ecowitt/METAR) vs previsão → wind-bias.json + windBias na row (tooltip do badge «Vento observado»)',
    callsPerFullRun: '0 pedidos novos (reutiliza observed do merge + windSpeed da row)',
    limits: 'Sem custo extra',
    notes: 'O merge-observations acumula pares previsão(kt) × observado(kt) por estação+spot+hora (dedup, janela 30 dias) em cada run; n≥10 antes de o ME/n ser anexado à row. ME = média(observado − previsão): positivo = modelo subestima o vento na estação.',
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
    id: 'ipma-warnings',
    name: 'IPMA avisos meteorológicos',
    tier: 'generous',
    usedFor: 'Avisos activos por área (Agitação Marítima, Vento, Trovoada, …) + radar (link)',
    callsPerFullRun: '2 pedidos (warnings_www.json + distrits-islands.json)',
    limits: 'Open data — uso moderado',
    notes: 'warnings_www.json cobre continente + Açores + Madeira; só níveis ≠ green. Radar sem API de imagem estável → link externo. Fallback automático para MeteoAlarm (EUMETNET) quando a API está em baixo — ver meteoalarm-warnings.',
  },
  {
    id: 'meteoalarm-warnings',
    name: 'MeteoAlarm (EUMETNET) avisos — fallback',
    tier: 'free-token',
    usedFor: 'Avisos activos por bbox (Agitação Marítima, Vento, Trovoada, …) — só quando o IPMA está em baixo',
    callsPerFullRun: '1 página EDR (locations/PT) + 1 CAP por aviso activo',
    limits: 'METEOGATE_API_KEY (apikey em api.meteogate.eu/warnings). EDR directo só para redistribuidores (METEOALARM_API_KEY). Chamadas só no fallback. Janela sent < 24 h.',
    notes: 'MeteoGate EDR (datetime sent-window) ou api.meteoalarm.org Bearer. CAP Oasis 1.2 normalizado para o mesmo shape do IPMA com source:"meteoalarm". Mapeamento spot→aviso por point-in-bbox (mais largo que distrito — over-covering propositado).',
  },
  {
    id: 'ipma-radar',
    name: 'IPMA radar (mosaico continente)',
    tier: 'generous',
    usedFor: 'Overlay de precipitação real no mapa (camada opcional)',
    callsPerFullRun: '1 manifest (imgs-radar.json) + 1 frame PNG (5-min cadence)',
    limits: 'Open data — 1 frame por run',
    notes: 'Sem WMTS/tiles públicos (sig.ipma.pt/geoserver mortos). Manifest estável em resources.www/transf/radar/imgs-radar.json; PNG com alpha (ecos) + bounds oficiais do mapbuilder-pt.js → L.imageOverlay no mapa.',
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
    id: 'forecast-skill-regression',
    name: 'Skill regression health-check (derivado — sem API nova)',
    tier: 'free',
    usedFor: 'Regressão do forecast por boia: janela recente (7 dias) vs baseline (21 dias) do forecast-skill.json → skill-regression.json (RMSE/|ME| acima do limiar = aviso) + notificação Telegram na transição',
    callsPerFullRun: '0 pedidos novos (reutiliza forecast-skill.json; arquiva snapshot diário)',
    limits: 'Sem custo extra',
    notes: 'check-skill-regression.js, depois do fetch-forecast-skill (modo full). Limiares: RMSE +0.3 m ou |ME| +0.3 m vs baseline; n≥10 por boia; transição notifica uma vez. Report/arquivo gitignored — nunca bloqueia o deploy.',
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
const PRIMARY_SPOT_COUNT_ESTIMATE = 181;
const HTTP_REQUESTS_PER_SPOT_FULL = 4;

/**
 * Weighted Open-Meteo calls per spot (confirmed: each requested model counts
 * as one call — see open-meteo/open-meteo#464 + pricing FAQ). Ensemble:
 * 4 wave models + 4 wind models + 2 best_match ≈ 10 (dia), 2 (noite).
 */
const OPEN_METEO_WEIGHTED_PER_SPOT = {
  multimodel: 10,
  bestMatch: 2,
};
const OPEN_METEO_WEIGHTED_PER_RUN_ESTIMATE =
  PRIMARY_SPOT_COUNT_ESTIMATE * OPEN_METEO_WEIGHTED_PER_SPOT.multimodel;

/**
 * @typedef {{ multimodelRuns: number; bestMatchRuns: number }} RunMix
 */

/**
 * @param {RunMix} mix
 * @returns {number} weighted Open-Meteo calls per day
 */
function estimatedOpenMeteoDaily(mix) {
  return (
    mix.multimodelRuns * OPEN_METEO_WEIGHTED_PER_SPOT.multimodel +
    mix.bestMatchRuns * OPEN_METEO_WEIGHTED_PER_SPOT.bestMatch
  ) * PRIMARY_SPOT_COUNT_ESTIMATE;
}

/** @type {Record<string, { dayRuns: number; multimodelDayRuns: number; nightRuns: number; obsOnlyRuns: number; winter: RunMix; summer: RunMix }>} */
const SCHEDULE_BUDGET = {
  /** Full runs 06–20h a cada 2h + 00h/04h + obs ímpares 07–19h. Multi-modelo
   *  só nas âncoras 06/12/18 (orçamento 10k/dia — ver updateSchedule.js).
   * Verão = dia + extra 17h (best_match). */
  proposed: {
    dayRuns: 8,
    multimodelDayRuns: 3,
    nightRuns: 2,
    obsOnlyRuns: 7,
    winter: { multimodelRuns: 3, bestMatchRuns: 5 + 2 },
    summer: { multimodelRuns: 3, bestMatchRuns: 6 + 2 },
  },
};

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
  const winter = estimatedOpenMeteoDaily(p.winter);
  const summer = estimatedOpenMeteoDaily(p.summer);
  const perRunMM = PRIMARY_SPOT_COUNT_ESTIMATE * OPEN_METEO_WEIGHTED_PER_SPOT.multimodel;
  const perRunBM = PRIMARY_SPOT_COUNT_ESTIMATE * OPEN_METEO_WEIGHTED_PER_SPOT.bestMatch;
  console.log('── Agenda (hora Lisboa) e orçamento Open-Meteo ──');
  console.log(`  Full runs: ${p.dayRuns}× dia (2h) + ${p.nightRuns}× noite (00h/04h) + extra 17h abr–out`);
  console.log(`  Multi-modelo (spread+blend): ${p.multimodelDayRuns}×/dia (06h, 12h, 18h) — restantes runs best_match`);
  console.log(`  Só observações (IH+IPMA+Ecowitt): ${p.obsOnlyRuns}× dia (07–19, horas ímpares)`);
  console.log(`  Custo/run: multi-modelo ~${perRunMM.toLocaleString('en')} · best_match ~${perRunBM.toLocaleString('en')} (${PRIMARY_SPOT_COUNT_ESTIMATE} spots × ${OPEN_METEO_WEIGHTED_PER_SPOT.multimodel}/${OPEN_METEO_WEIGHTED_PER_SPOT.bestMatch})`);
  console.log(`  Open-Meteo/dia: inverno ~${winter.toLocaleString('en')} · verão ~${summer.toLocaleString('en')} (limite 10 000 — ~${Math.round(winter / 100)}–${Math.round(summer / 100)}%)`);
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
