'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { chunkSpotsByTz, prefetchOpenMeteo, createPrefetchedFetchers, coordKey } = require('../openMeteoBatch');
const { skillBiasBySpot } = require('../forecastSkill');
const { applySkillBiasToRow } = require('../updateConditionsPure');

const mkSpot = (id, lat, lon) => ({ id, lat, lon });

// ── P2.1: batching ─────────────────────────────────────────────────────────
test('chunkSpotsByTz agrupa por fuso e fatia em lotes', () => {
  const spots = [
    ...Array.from({ length: 45 }, (_, i) => mkSpot(`lis-${i}`, 38.7 - i * 0.01, -9.4)),
    mkSpot('acor-1', 37.7, -25.7),
    mkSpot('acor-2', 39.4, -31.1),
    mkSpot('mad-1', 32.6, -16.9),
  ];
  const chunks = chunkSpotsByTz(spots, 40);
  assert.equal(chunks.length, 4); // 40+5 Lisboa, 2 Açores, 1 Madeira
  assert.deepEqual(
    chunks.map((c) => [c.tz, c.spots.length]),
    [
      ['Europe/Lisbon', 40],
      ['Europe/Lisbon', 5],
      ['Atlantic/Azores', 2],
      ['Atlantic/Madeira', 1],
    ],
  );
});

test('prefetchOpenMeteo faz 4 pedidos por lote e mapeia resposta→spot', async () => {
  const spots = [mkSpot('a', 38.7, -9.4), mkSpot('b', 37.0, -8.9)];
  const calls = [];
  const resp = (tag) =>
    spots.map((s) => ({ latitude: s.lat, longitude: s.lon, hourly: { time: [], tag } }));
  const fetchWithRetry = async (url, _r, _d, usage, weight) => {
    calls.push(url);
    usage.record(weight);
    if (url.includes('marine-api')) return resp('marine');
    return resp('weather');
  };
  const usage = { record: (w) => (usage.w = (usage.w ?? 0) + w) };
  const { byCoord, batches } = await prefetchOpenMeteo({
    spots,
    useMultiModel: true,
    usage,
    fetchWithRetry,
    marineApi: 'marine-api',
    weatherApi: 'weather-api',
  });
  assert.equal(batches, 1);
  assert.equal(calls.length, 4); // marine + weather + waveModels + windModels
  const entry = byCoord.get(coordKey(38.7, -9.4));
  assert.equal(entry.marine.hourly.tag, 'marine');
  assert.equal(entry.weather.hourly.tag, 'weather');
  assert.equal(usage.w, 2 + 2 + 2 + 2); // peso por coordenada nos 4 pedidos
});

test('fetchers prefetchados: hit no mapa não faz pedido; miss cai no individual', async () => {
  const fetched = [];
  const byCoord = new Map([[coordKey(38.7, -9.4), { marine: { hourly: { ok: 1 } } }]]);
  const fetchers = createPrefetchedFetchers({
    byCoord,
    fetchers: {
      fetchMarineData: async (lat, lon) => {
        fetched.push([lat, lon]);
        return { hourly: { individual: true } };
      },
      fetchWeatherData: async () => ({ hourly: {} }),
      fetchMarineWaveModels: async () => ({ hourly: {} }),
      fetchWindModels: async () => ({ hourly: {} }),
    },
  });
  const hit = await fetchers.fetchMarineData(38.7, -9.4);
  assert.equal(hit.hourly.ok, 1);
  assert.equal(fetched.length, 0);
  const miss = await fetchers.fetchMarineData(41.0, -8.6);
  assert.equal(miss.hourly.individual, true);
  assert.equal(fetched.length, 1);
});

test('resposta fora da tolerância de coordenada não entra no mapa', async () => {
  const spots = [mkSpot('a', 38.7, -9.4)];
  const fetchWithRetry = async () => [{ latitude: 40.0, longitude: -9.4, hourly: {} }];
  const { byCoord } = await prefetchOpenMeteo({
    spots,
    useMultiModel: false,
    usage: { record() {} },
    fetchWithRetry,
    marineApi: 'm',
    weatherApi: 'w',
  });
  assert.equal(byCoord.size, 0);
});

// ── P2.3: calibração por skill real ────────────────────────────────────────
const byBuoy = {
  4: { me: 0.43, n: 623, corr: 0.95, buoyName: 'CSA92/D' },
  19: { me: 0.16, n: 671, corr: 0.96, buoyName: 'CSA83/1D' }, // |me| < 0.2 → não qualifica
  86: { me: 0.84, n: 664, corr: 0.77, buoyName: 'BOND5' },
  6200084: { me: 0.75, n: 486, corr: 0.93, buoyName: 'Cabo Silleiro' },
};

test('skillBiasBySpot: gates n≥60 / corr≥0.7 / |me|∈[0.2,1.0]', () => {
  const spots = [mkSpot('s1'), mkSpot('s2'), mkSpot('s3'), mkSpot('s4')];
  const ih = { s1: { idEst: 4, distanceKm: 39 }, s2: { idEst: 19, distanceKm: 10 }, s3: { idEst: 99, distanceKm: 5 } };
  const wmo = { s1: { code: '6200084', distanceKm: 120 }, s4: { code: '6200084', distanceKm: 180 } };
  const out = skillBiasBySpot(spots, ih, wmo, byBuoy);
  assert.equal(out.s1.me, 0.43); // IH mais perto ganha ao WMO qualificado
  assert.equal(out.s1.buoy, 'CSA92/D');
  assert.equal(out.s2, undefined); // |me| 0.16 < 0.2
  assert.equal(out.s3, undefined); // boia sem skill
  assert.equal(out.s4.me, 0.75); // WMO-ES qualifica
  assert.equal(out.s4.buoy, 'Cabo Silleiro');
});

test('skillBiasBySpot: boia com corr fraca não calibra', () => {
  const weak = { 7: { me: 0.5, n: 500, corr: 0.18, buoyName: 'X' } };
  const out = skillBiasBySpot([mkSpot('s')], { s: { idEst: 7, distanceKm: 3 } }, {}, weak);
  assert.equal(out.s, undefined);
});

test('applySkillBiasToRow: soma me ao previsto, guarda raw e meta', () => {
  const row = applySkillBiasToRow({ waveHeight: 1.2 }, { me: 0.43, n: 623, corr: 0.95, buoy: 'CSA92/D' });
  assert.equal(row.waveHeight, 1.6);
  assert.equal(row.waveHeightRaw, 1.2);
  assert.equal(row.waveBias.src, 'skill');
  assert.equal(row.waveBias.buoy, 'CSA92/D');
  assert.equal(row.waveBias.deltaM, 0.4);
});

test('applySkillBiasToRow: sem skill ou delta <0.05 não toca na row', () => {
  const cur = { waveHeight: 1.2 };
  assert.equal(applySkillBiasToRow(cur, null), cur);
  assert.equal(applySkillBiasToRow(cur, { me: 0.02, n: 100 }), cur);
});
