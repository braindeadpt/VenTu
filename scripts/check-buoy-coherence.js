/**
 * Cross-border buoy coherence — Spanish (Puertos del Estado) vs Portuguese
 * wave buoys, compared on overlapping hours. The PT side is the WMO/GTS
 * derivative (Copernicus, keyless — the fallback the merge attaches); when
 * IH_API_KEY is set, the SAME-coast IH Datawell buoys (primary source) are
 * also compared, yielding ES×IH pairs alongside the ES×WMO ones.
 *
 * Downloads today's Copernicus S3 NetCDF for the ES buoys (Cabo Silleiro,
 * Villano-Sisargas) and the PT buoys (Porto/Leixões, Faro), extracts the full
 * hourly surface series, aligns both on common UTC hours and computes
 * n / mean|Δhs| / ME / max / correlation per pair. The verdict validates that
 * the observedWave cross-border attach (a Spanish reading attached to NW
 * Portugal spots) is coherent with what the Portuguese buoys report.
 *
 * Writes public/data/buoy-coherence.json for the audit + validator.
 * Graceful degradation: on any failure we keep the previous report (if any)
 * and exit 0 — an optional validation layer never blocks the pipeline.
 */

const fs = require('fs');
const path = require('path');
const {
  dayKey,
  listDayWaveKeys,
  fetchNetCdfBytes,
  parseNetCdf,
  surfaceSeries,
  CATALOG_BY_CODE,
  haversineKm,
} = require('./lib/copernicusBuoys.js');
const {
  fetchBuoyStations,
  fetchBuoyWaveSeries,
  waveWindow,
  DEFAULT_IH_API,
  DEFAULT_WAVE_API,
} = require('./lib/ihBuoys.js');
const {
  overallVerdict,
  alignOnHours,
  MIN_PAIRS,
  MIN_ACCUMULATED_PAIRS,
} = require('./lib/buoyCoherence.js');
const {
  readArchive,
  writeArchive,
  mergeDayPairs,
  pruneArchive,
  pairStatsFromArchive,
  ARCHIVE_WINDOW_DAYS,
} = require('./lib/buoyCoherenceArchive.js');
const {
  readDailyArchive,
  writeDailyArchive,
  pruneDailyArchive,
  deriveDailyVerdicts,
  mergeDailyVerdicts,
  buildDailyTrend,
  resolveIhStationForWmo,
  buildIhCoherencePair,
  DAILY_WINDOW_DAYS,
} = require('./lib/buoyCoherenceDaily.js');

const OUTPUT_PATH =
  process.env.BUOY_COHERENCE_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/buoy-coherence.json');
const ARCHIVE_PATH =
  process.env.BUOY_COHERENCE_ARCHIVE_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/buoy-coherence-archive.json');
const DAILY_PATH =
  process.env.BUOY_COHERENCE_DAILY_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/buoy-coherence-daily.json');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
const WAVE_API = process.env.IH_BUOY_WAVE_API_URL || DEFAULT_WAVE_API;
const API_KEY = process.env.IH_API_KEY?.trim() || null;

/** ES × PT pairs of interest for the observedWave cross-border coherence. */
const PAIRS = [
  { a: '6200084', b: '6201077' }, // Cabo Silleiro × Porto/Leixões (o par NW chave)
  { a: '6200083', b: '6201077' }, // Villano-Sisargas × Porto/Leixões
  { a: '6200084', b: '6201079' }, // Cabo Silleiro × Faro
  { a: '6200083', b: '6201079' }, // Villano-Sisargas × Faro
  // Golfo de Cádiz é a boia que o mapping anexa aos spots do Algarve/Vicentina
  // quando a boia de Faro está stale — validar que não lê outra onda.
  { a: '6200085', b: '6201079' }, // Golfo de Cádiz × Faro
];

async function fetchBuoySeries(code) {
  const keys = await listDayWaveKeys();
  const key = keys.find((k) => k.code === code);
  if (!key) return null;
  const raw = await parseNetCdf(await fetchNetCdfBytes(key.key));
  return surfaceSeries(raw);
}

async function checkBuoyCoherence() {
  console.log('🌊 Coherence — Spanish × Portuguese buoys on overlapping hours...\n');

  const day = dayKey();
  const wanted = new Set(PAIRS.flatMap((p) => [p.a, p.b]));

  const series = {};
  for (const code of wanted) {
    const meta = CATALOG_BY_CODE[code] ?? {};
    try {
      const rows = await fetchBuoySeries(code);
      if (rows && rows.length) {
        series[code] = rows;
        console.log(
          `  ${code} (${meta.name ?? code}): ${rows.length} readings` +
            ` · ${rows[0].date.slice(0, 13)} → ${rows[rows.length - 1].date.slice(0, 13)}`,
        );
      } else {
        console.warn(`  ${code} (${meta.name ?? code}): no series in S3 today`);
      }
    } catch (err) {
      console.warn(`  ${code} (${meta.name ?? code}): ${err.message}`);
    }
  }

  const haveEs = ['6200084', '6200083', '6200085'].some((c) => series[c]);
  const havePt = ['6201077', '6201079'].some((c) => series[c]);
  if (!haveEs || !havePt) {
    console.warn('⚠️ Missing ES or PT buoys — no comparison today; keeping previous report (if any).');
    return null;
  }

  const config = PAIRS.filter(({ a, b }) => series[a] && series[b]).map(({ a, b }) => ({
    a: {
      code: a,
      name: CATALOG_BY_CODE[a]?.name ?? a,
      lat: series[a][0].lat,
      lon: series[a][0].lon,
      rows: series[a],
    },
    b: {
      code: b,
      name: CATALOG_BY_CODE[b]?.name ?? b,
      lat: series[b][0].lat,
      lon: series[b][0].lon,
      rows: series[b],
    },
    // Referência PT usada no par: a leitura WMO/GTS (fallback) por omissão;
    // os pares ES×IH (com key) marcam source 'ih'.
    ptSource: 'wmo',
  }));

  // ── Pares ES×IH (quando a IH_API_KEY está activa) ────────────────────────
  // Para além do ES×WMO-PT (fallback keyless), valida-se a coerência entre a
  // boia espanhola e o mesmo-class Datawell do IH — a fonte PRIMÁRIA portuguesa
  // (fetchBuoyWaveSeries, keyed). O mapeamento do PT WMO code (6201077 Porto/
  // 6201079 Faro — precisamente os códigos nos PAIRS) para o idEst IH usa o
  // wmo_id da estação (p.ex. CSA92/D→6201077, CSA82/D→6201079). As leituras IH
  // entram na MESMA acumulação (esHs/ptHs), com ptHs = hm0; dedup por par+hora
  // não colide com o par WMO porque os códigos do par diferem (wmo vs idEst).
  let ihPairCount = 0;
  if (API_KEY) {
    const stations = await fetchBuoyStations(IH_API);
    for (const { a, b } of PAIRS) {
      const st = resolveIhStationForWmo(stations, String(b));
      if (!st) {
        console.warn(`  ℹ️  ${b}: sem estação IH com wmo_id=${b} — sem par ES×IH`);
        continue;
      }
      if (!series[a]) {
        console.warn(`  ⚠️ ${a}: série ES em falta — sem par ES×IH (${st.name})`);
        continue;
      }
      try {
        const ihRows = await fetchBuoyWaveSeries(API_KEY, st.idEst, WAVE_API, fetch, waveWindow());
        const pair = buildIhCoherencePair(
          {
            code: a,
            name: CATALOG_BY_CODE[a]?.name ?? a,
            lat: series[a][0].lat,
            lon: series[a][0].lon,
            rows: series[a],
          },
          st,
          ihRows,
        );
        if (pair) {
          config.push(pair);
          ihPairCount += 1;
          console.log(
            `  🇵🇹 IH ${st.idEst} (${st.name}, wmo ${b}) × ES ${a}: ${pair.b.rows.length} leituras`,
          );
        } else {
          console.warn(`  ⚠️ ${st.idEst} (${st.name}): sem leituras IH usáveis (hm0/date válidos) — sem par ES×IH`);
        }
      } catch (err) {
        console.warn(`  ⚠️ IH ${st.idEst} (${st.name}): ${err.message}`);
      }
    }
  } else {
    console.log('  ℹ️  IH_API_KEY not set — só coerência ES×WMO-PT (keyless); sem ES×IH.');
  }
  if (ihPairCount > 0) {
    console.log(`  🇵🇹 ${ihPairCount} par(es) ES×IH a entrar na coerência (fonte PT primária, com IH_API_KEY).`);
  }

  // ── Arquivo de coerência: pares horários acumulados dia a dia ────────────
  // As boias PT reportam esparsamente (poucas leituras/dia), por isso o n de um
  // único run é quase sempre < MIN_PAIRS. Acumulamos os pares alinhados (dedup
  // por par+hora UTC) e calculamos o veredicto sobre a janela — n suficiente
  // mesmo com as boias PT esparsas.
  const archive = readArchive(ARCHIVE_PATH);
  archive.fetchedAt = new Date().toISOString();
  const rowDateInHour = (rows, hour) => {
    const r = (rows ?? []).find((x) => String(x.date).slice(0, 13) === hour);
    return r?.date ? String(r.date) : `${hour}:00:00Z`;
  };
  let newPairs = 0;
  const hoursByPair = new Map();
  for (const { a, b } of config) {
    const aligned = alignOnHours(a.rows, b.rows);
    const dayPairs = aligned.map((p) => {
      const aDate = rowDateInHour(a.rows, p.hour);
      const bDate = rowDateInHour(b.rows, p.hour);
      // `date` = leitura mais recente das duas (âncora de prune e de re-fetch).
      return {
        pair: `${a.name} × ${b.name}`,
        codes: [a.code, b.code],
        hour: p.hour,
        esHs: p.a,
        ptHs: p.b,
        date: new Date(aDate) > new Date(bDate) ? aDate : bDate,
      };
    });
    newPairs += mergeDayPairs(archive, dayPairs);
    // Detalhe de hoje para o relatório (horas sobrepostas + leituras). Key por
    // códigos do par (a ES repete-se no ES×WMO e ES×IH — key separa-os).
    hoursByPair.set(`${a.code}|${b.code}`, aligned);
  }
  pruneArchive(archive);
  writeArchive(archive, ARCHIVE_PATH);
  console.log(`🗃️  Coherence archive: ${archive.pairs.length} pares-hora acumulados (${newPairs} novos hoje, janela ${ARCHIVE_WINDOW_DAYS} dias)`);

  // Veredicto sobre a ACUMULAÇÃO (n suficiente), horas = hoje (detalhe).
  const pairs = config.map(({ a, b, ptSource }) => {
    const stats = pairStatsFromArchive(archive, [a.code, b.code]);
    const distanceKm = Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 10) / 10;
    const aligned = hoursByPair.get(`${a.code}|${b.code}`) ?? [];
    return {
      pair: `${a.name} × ${b.name}`,
      codes: [a.code, b.code],
      distanceKm,
      // Referência PT do par: 'wmo' (fallback GTS) ou 'ih' (fonte primária,
      // só com IH_API_KEY) — para auditar qual a fonte com que o ES foi
      // comparado e separar ES×WMO de ES×IH no report/trend.
      ptSource,
      n: stats?.n ?? 0,
      ...(stats ?? { meanDeltaM: null, meanAbsDeltaM: null, maxAbsDeltaM: null, corr: null, firstHour: null, lastHour: null }),
      hours: aligned.map((p) => ({ hour: p.hour, [a.code]: p.a, [b.code]: p.b })),
    };
  });
  const report = { pairs, overall: overallVerdict(pairs.map((p) => p.verdict)) };
  const verdictIcons = {
    coherent: '✅',
    review: '🟡',
    incoherent: '🔴',
    insufficient: '⚪',
  };

  for (const p of report.pairs) {
    const corr = p.corr == null ? '—' : ` · r ${p.corr}`;
    const span = p.firstHour && p.lastHour ? ` · ${p.firstHour}→${p.lastHour}` : '';
    const src = p.ptSource === 'ih' ? ' · IH' : ' · WMO';
    console.log(
      `  ${verdictIcons[p.verdict]} ${p.pair} (${p.distanceKm} km): n=${p.n}` +
        ` · mean|Δ| ${p.meanAbsDeltaM} m · ME ${p.meanDeltaM >= 0 ? '+' : ''}${p.meanDeltaM} m` +
        ` · max ${p.maxAbsDeltaM} m${corr}${span}${src} → ${p.verdict}`,
    );
  }
  const overallIcon = verdictIcons[report.overall] ?? '⚪';
  console.log(`\n  ${overallIcon} Overall: ${report.overall}`);

  // ── Arquivo DIÁRIO de veredictos (padrões sazonais, não só hoje) ─────────
  // Cada run deriva um veredicto por dia/par a partir do arquivo horário e
  // acumula-o num arquivo de janela LONGA (DAILY_WINDOW_DAYS — mais que a
  // janela horária), para que uma divergência sazonal (ex.: tempestades de
  // inverno) sobreviva ao rolling window das horas e fique visível no trend.
  const daily = readDailyArchive(DAILY_PATH);
  daily.fetchedAt = new Date().toISOString();
  const derived = deriveDailyVerdicts(archive);
  const dailyTouched = mergeDailyVerdicts(daily, derived);
  pruneDailyArchive(daily);
  writeDailyArchive(daily, DAILY_PATH);
  const dailyTrend = buildDailyTrend(daily);
  const incoherentTrend =
    Object.entries(dailyTrend)
      .filter(([, t]) => t.incoherent > 0)
      .map(([k, t]) => `${t.pair}: ${t.incoherent}/${t.days} dias incoherent (ratio ${t.incoherentRatio})`);
  if (incoherentTrend.length > 0) {
    console.warn(
      `📅 Trend diário (janela ${DAILY_WINDOW_DAYS} dias) — pares com pronto incoherent:`,
    );
    for (const line of incoherentTrend) console.warn(`   🔴 ${line}`);
  } else {
    console.log(
      `📅 Trend diário (janela ${DAILY_WINDOW_DAYS} dias): ${Object.values(dailyTrend).reduce((s, t) => s + t.days, 0)} dias acumulados, nenhum par com veredicto incoherent.`,
    );
  }

  // Carrega o relatório anterior (se existir) para PRESERVAR os blocos
  // acumulados que este check não produz: `gateHistory` (histórico de recusas
  // do merge por boia ES) e `regions`/`regionsAuditedAt` (auditoria por região
  // do merge). Como este script REESCREVE o ficheiro de raiz a cada run, sem
  // este carry-over o histórico acumulado seria apagado.
  let previous = null;
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    }
  } catch {
    previous = null;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        day,
        fetchedAt: new Date().toISOString(),
        minPairs: MIN_PAIRS,
        // O veredicto do relatório é sobre a JANELA acumulada (n de muitas horas)
        // — o gate real é o MIN_ACCUMULATED_PAIRS, registado aqui para o
        // validador/About saberem o floor a que o veredicto foi calculado.
        minAccumulatedPairs: MIN_ACCUMULATED_PAIRS,
        archive: {
          windowDays: ARCHIVE_WINDOW_DAYS,
          pairHourCount: archive.pairs.length,
          path: 'buoy-coherence-archive.json',
        },
        daily: {
          windowDays: DAILY_WINDOW_DAYS,
          dayCount: daily.days.length,
          trend: dailyTrend,
          path: 'buoy-coherence-daily.json',
        },
        // Blocos acumulados pelo merge-observations no report anterior (o check
        // re-escreve o ficheiro mas nunca deve perder o histórico do gate).
        ...(previous && previous.gateHistory
          ? { gateHistory: previous.gateHistory }
          : {}),
        ...(previous && previous.regions
          ? { regions: previous.regions, regionsAuditedAt: previous.regionsAuditedAt }
          : {}),
        ...report,
      },
      null,
      2,
    ),
  );

  console.log(`✅ Coherence report saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`🗃️  Archive saved to ${path.relative(process.cwd(), ARCHIVE_PATH)}`);
  console.log(`📅  Daily verdict archive saved to ${path.relative(process.cwd(), DAILY_PATH)} (${dailyTouched} dias novos/actualizados)`);
  if (report.overall === 'incoherent') {
    console.error(
      '🔴 Boias ES e PT a divergirem nas horas sobrepostas — o observedWave cross-border pode estar a anexar leituras de outra onda.',
    );
  }
  return report;
}

async function run() {
  try {
    await checkBuoyCoherence();
  } catch (err) {
    console.error('❌ Coherence check failed:', err.message || err);
    console.warn('⚠️ Keeping previous buoy-coherence.json — pipeline continues.');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  checkBuoyCoherence,
  run,
  PAIRS,
  OUTPUT_PATH,
};
