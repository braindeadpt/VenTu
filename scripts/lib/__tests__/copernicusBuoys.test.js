import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  dayKey,
  epochDaysToIso,
  toFlatArray,
  surfaceSeries,
  surfaceReading,
  isFreshReading,
  mapSpotsToWmoBuoys,
  findUnmappedEsBuoys,
  observedWaveForSpot,
  esBridgeObservedWaveForSpot,
  listDayWaveKeys,
  PLATFORM_CATALOG,
  CATALOG_BY_CODE,
  ES_BUOY_CODES,
  PT_KEYLESS_WMO_CODES,
  KEYLESS_WMO_CODES,
  wmoOriginForWmoCode,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
} = require('../copernicusBuoys.js');

const NOW = Date.UTC(2026, 7, 14, 18, 0, 0); // 2026-08-14T18:00Z

describe('catálogo WMO (PLATFORM_CATALOG)', () => {
  it('inclui a Nazaré Costeira (6200199) como PT — cobertura sem IH_API_KEY', () => {
    const nazare = CATALOG_BY_CODE['6200199'];
    expect(nazare).toBeDefined();
    expect(nazare.country).toBe('PT');
    expect(nazare.area).toBe('Nazaré');
    // PT não é da rota ES (cross-border) — não entra no viés/skill ES.
    expect(ES_BUOY_CODES).not.toContain('6200199');
  });

  it('cada código do catálogo é único e de 7 dígitos', () => {
    const codes = PLATFORM_CATALOG.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^\d{7}$/);
  });
});

describe('listDayWaveKeys', () => {
  const xmlDoc = (...keys) => `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Name>mdl-native-01</Name><Prefix>native/</Prefix><KeyCount>${keys.length}</KeyCount>
${keys.map((k) => `<Contents><Key>native/latest/20260831/${k}</Key></Contents>`).join('')}
</ListBucketResult>`;

  it('descobre a Nazaré (IR_TS_MO_6200199) e os códigos catalogados', async () => {
    const fetchMock = async () =>
      new Response(
        xmlDoc(
          'IR_TS_MO_6200199_20260831.nc',
          'PT_TS_MO_6201077_20260831.nc',
          'ES_TS_MO_6200084_20260831.nc',
          // Não-catalogado / variante _WS_ que NÃO devem entrar (o dia é
          // escopado pelo prefixo S3 `latest/<day>/`, por isso não há datas
          // fora do dia dentro da pasta).
          'IR_TS_MO_1234567_20260831.nc',
          'PT_WS_MO_6200199_20260831.nc',
        ),
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    const keys = await listDayWaveKeys('20260831', fetchMock, 'http://mock-s3', 'native/latest/');
    const codes = keys.map((k) => k.code).sort();
    expect(codes).toEqual(['6200084', '6200199', '6201077']);
    const nazare = keys.find((k) => k.code === '6200199');
    expect(nazare.key).toMatch(/IR_TS_MO_6200199_20260831\.nc$/);
  });

  it('segue o continuation token quando há mais de uma página', async () => {
    const fetchMock = async (url) => {
      if (String(url).includes('continuation-token')) {
        return new Response(
          xmlDoc('IR_TS_MO_6200199_20260831.nc'),
          { status: 200, headers: { 'Content-Type': 'application/xml' } },
        );
      }
      return new Response(
        xmlDoc('PT_TS_MO_6201077_20260831.nc') + '<NextContinuationToken>tok-2</NextContinuationToken>',
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    };
    const keys = await listDayWaveKeys('20260831', fetchMock, 'http://mock-s3', 'native/latest/');
    expect(keys.map((k) => k.code).sort()).toEqual(['6200199', '6201077']);
  });
});

describe('dayKey', () => {
  it('devolve YYYYMMDD em UTC', () => {
    expect(dayKey(Date.UTC(2026, 7, 14, 23, 59))).toBe('20260814');
    expect(dayKey(Date.UTC(2026, 0, 3, 0, 30))).toBe('20260103');
  });
});

describe('epochDaysToIso', () => {
  it('converte days-since-1950 (época Copernicus) em ISO', () => {
    // Valor real observado no ficheiro 6201077 (2026-08-14 ~08:02 UTC)
    expect(epochDaysToIso(27984.334722222222)).toBe('2026-08-14T08:02:00.000Z');
    expect(epochDaysToIso(27984)).toBe('2026-08-14T00:00:00.000Z');
  });

  it('devolve null para entradas inválidas', () => {
    expect(epochDaysToIso('x')).toBeNull();
    expect(epochDaysToIso(undefined)).toBeNull();
    expect(epochDaysToIso(NaN)).toBeNull();
  });
});

describe('toFlatArray', () => {
  it('normaliza number / array / object-chaveado do h5wasm', () => {
    expect(toFlatArray(42.5)).toEqual([42.5]);
    expect(toFlatArray([1, 2])).toEqual([1, 2]);
    expect(toFlatArray({ 0: 1, 1: 2, 2: 3 })).toEqual([1, 2, 3]);
    expect(toFlatArray(undefined)).toEqual([]);
  });
});

describe('surfaceReading — schema PT (Datawell, VGHS/VDIR)', () => {
  // Espelha o ficheiro real 6201077: TIME [1], vars [1,3], DEPH [0,0,0.5]
  const ptRaw = {
    TIME: { 0: 27984.334722222222 },
    LATITUDE: 41.31621170043945,
    LONGITUDE: -8.983489990234375,
    STATION: ['6', '2', '0', '1', '0', '7', '7'],
    DEPH: { 0: 0, 1: 0, 2: 0.5 },
    VGHS: { 0: 9.969209968386869e36, 1: 1.1399999856948853, 2: 9.969209968386869e36 },
    VGHS_QC: { 0: -127, 1: 1, 2: -127 },
    VTPK: { 0: 9.969209968386869e36, 1: 10, 2: 9.969209968386869e36 },
    VTPK_QC: { 0: -127, 1: 1, 2: -127 },
    VDIR: { 0: 9.969209968386869e36, 1: 300, 2: 9.969209968386869e36 },
    VDIR_QC: { 0: -127, 1: 1, 2: -127 },
    VZMX: { 0: 9.969209968386869e36, 1: 1.62, 2: 9.969209968386869e36 },
    VZMX_QC: { 0: -127, 1: 1, 2: -127 },
    TEMP: { 0: 9.969209968386869e36, 1: 9.969209968386869e36, 2: 19.8 },
    TEMP_QC: { 0: -127, 1: -127, 2: 1 },
  };

  it('extrai a leitura à superfície (profundidade 0, QC=1)', () => {
    const r = surfaceReading(ptRaw);
    expect(r).not.toBeNull();
    expect(r.date).toBe('2026-08-14T08:02:00.000Z');
    expect(r.lat).toBeCloseTo(41.316, 3);
    expect(r.lon).toBeCloseTo(-8.983, 3);
    expect(r.station).toBe('6201077');
    expect(r.hs).toBeCloseTo(1.14, 2);
    expect(r.tp).toBe(10);
    expect(r.dir).toBe(300);
    expect(r.hmax).toBeCloseTo(1.62, 2);
    expect(r.sst).toBeCloseTo(19.8, 1);
  });

  it('recusa leituras sem VGHS válido e sem QC=1', () => {
    const noHs = { ...ptRaw, VGHS: { 0: 9.969209968386869e36, 1: 9.969209968386869e36, 2: 9.969209968386869e36 } };
    expect(surfaceReading(noHs)).toBeNull();
    const badQc = { ...ptRaw, VGHS_QC: { 0: -127, 1: -127, 2: -127 } };
    expect(surfaceReading(badQc)).toBeNull();
  });

  it('recusa sem coordenadas ou sem TIME', () => {
    expect(surfaceReading({ ...ptRaw, LATITUDE: undefined })).toBeNull();
    expect(surfaceReading({ ...ptRaw, TIME: undefined })).toBeNull();
    expect(surfaceReading(null)).toBeNull();
  });
});

describe('surfaceReading — schema ES (Puertos del Estado, VHM0/VMDR, série horária)', () => {
  const fill = 9.969209968386869e36;
  // 17 horas (27984.00 → 27984.66667); vars [17,3]; DEPH [-3,0,3]
  const timeArr = Array.from({ length: 17 }, (_, i) => 27984 + (i / 24));
  // VHM0 sempre na profundidade 1 (superfície): 1.4 m em todas as horas
  const vhm0 = [];
  const vhm0qc = [];
  const vtpk = [];
  const vmdr = [];
  const temp = [];
  const tempQc = [];
  for (let row = 0; row < 17; row++) {
    vhm0.push(fill, 1.4, fill);
    vhm0qc.push(-127, 1, -127);
    vtpk.push(fill, 9.2, fill);
    vmdr.push(fill, 330, fill);
    temp.push(fill, fill, 20.0);
    tempQc.push(-127, -127, 1);
  }
  const esRaw = {
    TIME: timeArr,
    LATITUDE: 42.12,
    LONGITUDE: -9.43,
    STATION: ['6', '2', '0', '0', '0', '8', '4'],
    DEPH: [-3, 0, 3],
    VHM0: vhm0,
    VHM0_QC: vhm0qc,
    VTPK: vtpk,
    VMDR: vmdr,
    TEMP: temp,
    TEMP_QC: tempQc,
  };

  it('devolve a linha MAIS RECENTE (não a primeira)', () => {
    const r = surfaceReading(esRaw);
    expect(r).not.toBeNull();
    expect(r.date).toBe('2026-08-14T16:00:00.000Z'); // 27984.66667
    expect(r.hs).toBeCloseTo(1.4, 2);
    expect(r.tp).toBeCloseTo(9.2, 1);
    expect(r.dir).toBe(330);
    expect(r.sst).toBeCloseTo(20.0, 1);
    expect(r.hmax).toBeUndefined(); // VZMX não existe no schema ES
  });

  it('salta linhas antigas quando a mais recente não tem onda', () => {
    const broken = { ...esRaw, VHM0: [...esRaw.VHM0], VHM0_QC: [...esRaw.VHM0_QC] };
    // última linha (row 16) sem onda válida
    for (let i = 48; i < 51; i++) {
      broken.VHM0[i] = fill;
      broken.VHM0_QC[i] = -127;
    }
    const r = surfaceReading(broken);
    expect(r).not.toBeNull();
    expect(r.date).toBe('2026-08-14T15:00:00.000Z'); // row 15
  });
});

describe('surfaceSeries — série horária completa', () => {
  it('devolve TODAS as linhas válidas (ES, 17h), não só a mais recente', () => {
    // Reutiliza o mesmo layout ES do teste anterior (17 horas, 1.4 m sempre)
    const fill = 9.969209968386869e36;
    const timeArr = Array.from({ length: 17 }, (_, i) => 27984 + i / 24);
    const vhm0 = [];
    const vhm0qc = [];
    for (let row = 0; row < 17; row++) {
      vhm0.push(fill, 1.4, fill);
      vhm0qc.push(-127, 1, -127);
    }
    const esRaw = {
      TIME: timeArr,
      LATITUDE: 42.12,
      LONGITUDE: -9.43,
      STATION: ['6', '2', '0', '0', '0', '8', '4'],
      DEPH: [-3, 0, 3],
      VHM0: vhm0,
      VHM0_QC: vhm0qc,
    };
    const rows = surfaceSeries(esRaw);
    expect(rows).toHaveLength(17);
    expect(rows[0].date).toBe('2026-08-14T00:00:00.000Z');
    expect(rows[16].date).toBe('2026-08-14T16:00:00.000Z');
    expect(rows[16].hs).toBeCloseTo(1.4, 2);
    // surfaceReading == última da série
    expect(surfaceReading(esRaw)).toEqual(rows[16]);
  });

  it('filtra horas sem onda válida / QC mau (série fica mais curta)', () => {
    const fill = 9.969209968386869e36;
    const timeArr = Array.from({ length: 3 }, (_, i) => 27984 + i / 24);
    const vhm0 = [];
    const vhm0qc = [];
    for (let row = 0; row < 3; row++) {
      vhm0.push(fill, 1.4, fill);
      vhm0qc.push(-127, 1, -127);
    }
    vhm0[1] = fill; // row 0 hs = fill
    vhm0qc[1] = -127;
    const esRaw = {
      TIME: timeArr,
      LATITUDE: 42.12,
      LONGITUDE: -9.43,
      STATION: ['6', '2', '0', '0', '0', '8', '4'],
      DEPH: [-3, 0, 3],
      VHM0: vhm0,
      VHM0_QC: vhm0qc,
    };
    const rows = surfaceSeries(esRaw);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-08-14T01:00:00.000Z');
    expect(rows[1].date).toBe('2026-08-14T02:00:00.000Z');
  });

  it('devolve [] para ficheiro inválido / sem coords / sem TIME', () => {
    expect(surfaceSeries(null)).toEqual([]);
    expect(surfaceSeries({})).toEqual([]);
    expect(surfaceSeries({ TIME: [1], LATITUDE: undefined, LONGITUDE: 5 })).toEqual([]);
  });

  it('regressão: DEPH row-major PT (6 observações) — lê TODAS as horas, não só a primeira', () => {
    // Layout real do ficheiro 6201079 de 2026-08-14: TIME [6], DEPH row-major
    // [0,0,0.5]×6 (18 valores), vars [18]. Antes da correcção o depthCount era
    // 18 e só a row 0 era lida → o `latest` ficava preso às 04:25 em vez de 12:55.
    const fill = 9.969209968386869e36;
    const raw = {
      TIME: [27984.184027777778, 27984.204861111112, 27984.30902777778, 27984.37152777778, 27984.43402777778, 27984.538194444444],
      LATITUDE: 36.90525817871094,
      LONGITUDE: -7.8976898193359375,
      STATION: ['6', '2', '0', '1', '0', '7', '9'],
      DEPH: [0, 0, 0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 0, 0.5, 0, fill, fill, 0, 0, 0.5],
      VGHS: [fill, 0.43, fill, fill, 0.47, fill, fill, 0.48, fill, 0.47, fill, fill, fill, fill, fill, fill, 0.44, fill],
      VGHS_QC: [-127, 1, -127, -127, 1, -127, -127, 1, -127, 1, -127, -127, -127, -127, -127, -127, 1, -127],
    };
    const rows = surfaceSeries(raw);
    // Horas válidas: 04:25, 04:54, 07:25, 08:55, 12:55 (row 4 — 10:25 — sem onda)
    expect(rows).toHaveLength(5);
    expect(rows[0].date).toBe('2026-08-14T04:25:00.000Z');
    expect(rows[4].date).toBe('2026-08-14T12:55:00.000Z');
    expect(rows[4].hs).toBeCloseTo(0.44, 2);
    // surfaceReading = a MAIS recente (12:55), não a primeira válida
    expect(surfaceReading(raw).date).toBe('2026-08-14T12:55:00.000Z');
    expect(surfaceReading(raw).hs).toBeCloseTo(0.44, 2);
  });
});

describe('isFreshReading', () => {
  it('aceita ≤6h e recusa futuras/antigas', () => {
    expect(MAX_OBS_AGE_HOURS).toBe(6);
    expect(isFreshReading('2026-08-14T16:00:00Z', NOW)).toBe(true);
    expect(isFreshReading('2026-08-14T12:00:00Z', NOW)).toBe(true); // 6h exactas
    expect(isFreshReading('2026-08-14T11:59:00Z', NOW)).toBe(false);
    expect(isFreshReading('2026-08-14T18:30:00Z', NOW)).toBe(false); // futura
    expect(isFreshReading('x', NOW)).toBe(false);
  });
});

describe('mapSpotsToWmoBuoys', () => {
  const buoys = {
    '6201077': {
      code: '6201077', name: 'Datawell ao largo do Porto', area: 'Porto',
      lat: 41.32, lon: -8.98,
      latest: { date: '2026-08-14T08:02:00Z', hs: 1.14 },
    },
    '6200084': {
      code: '6200084', name: 'Cabo Silleiro', area: 'Galiza',
      lat: 42.12, lon: -9.43,
      latest: { date: '2026-08-14T16:00:00Z', hs: 1.41 },
    },
    '6200085': {
      code: '6200085', name: 'Golfo de Cádiz', area: 'Andaluzia',
      lat: 36.49, lon: -6.96,
      latest: { date: '2026-08-14T16:00:00Z', hs: 0.47 },
    },
  };
  const spots = [
    { id: 'moledo', lat: 41.85, lon: -8.87 },
    { id: 'sines', lat: 37.95, lon: -8.87 },
  ];

  it('só mapeia boias com leitura fresca (a do Porto, 08:02, é antiga → excluída)', () => {
    const mapping = mapSpotsToWmoBuoys(spots, buoys, MAX_BUOY_MAP_KM, NOW);
    expect(mapping.moledo.code).toBe('6200084'); // Cabo Silleiro, não a boia do Porto
    expect(mapping.moledo.stationTitle).toBe('Cabo Silleiro');
    expect(mapping.moledo.distanceKm).toBeLessThan(100);
  });

  it('respeita o raio de mapping', () => {
    const mapping = mapSpotsToWmoBuoys(spots, buoys, 50, NOW);
    expect(mapping).toEqual({});
  });

  it('devolve {} sem boias frescas', () => {
    const stale = { date: '2026-08-14T01:00:00Z', hs: 1 };
    const allStale = {
      '6200084': { ...buoys['6200084'], latest: stale },
      '6200085': { ...buoys['6200085'], latest: stale },
    };
    expect(mapSpotsToWmoBuoys(spots, allStale, MAX_BUOY_MAP_KM, NOW)).toEqual({});
  });
});

describe('observedWaveForSpot (fallback WMO)', () => {
  const buoy = {
    code: '6200084', name: 'Cabo Silleiro', area: 'Galiza',
    lat: 42.12, lon: -9.43,
    latest: { date: '2026-08-14T16:00:00Z', hs: 1.41, tp: 4.7, dir: 334, sst: 20.1 },
  };

  it('constrói o payload observedWave com source wmo-buoy', () => {
    const wave = observedWaveForSpot({ code: '6200084', distanceKm: 55.8 }, buoy, { nowMs: NOW });
    expect(wave).not.toBeNull();
    expect(wave.waveHeight).toBeCloseTo(1.41, 2);
    expect(wave.wavePeriod).toBeCloseTo(4.7, 1);
    expect(wave.waveDirection).toBe(334);
    expect(wave.waterTemp).toBeCloseTo(20.1, 1);
    expect(wave.stationName).toBe('Cabo Silleiro');
    expect(wave.stationArea).toBe('Galiza');
    expect(wave.distanceKm).toBe(55.8);
    expect(wave.observedAt).toBe('2026-08-14T16:00:00Z');
    expect(wave.source).toBe('wmo-buoy');
  });

  it('recusa além do raio de attach ou leitura antiga', () => {
    expect(observedWaveForSpot({ code: '6200084', distanceKm: 201 }, buoy, { nowMs: NOW })).toBeNull();
    expect(observedWaveForSpot({ code: '6200084', distanceKm: 55.8 }, null)).toBeNull();
    expect(observedWaveForSpot(null, buoy)).toBeNull();
    const stale = { ...buoy, latest: { date: '2026-08-14T01:00:00Z', hs: 1 } };
    expect(observedWaveForSpot({ code: '6200084', distanceKm: 55.8 }, stale, { nowMs: NOW })).toBeNull();
    expect(MAX_BUOY_ATTACH_KM).toBe(200);
  });
});

describe('esBridgeObservedWaveForSpot (ponte keyless Costa de Prata ← Cabo Silleiro)', () => {
  const silleiro = {
    code: '6200084',
    name: 'Cabo Silleiro',
    area: 'Galiza',
    country: 'ES',
    lat: 42.12,
    lon: -9.43,
    latest: { date: '2026-08-14T16:00:00Z', hs: 1.88, tp: 9.2, dir: 323, sst: 21.2 },
  };
  const nazare = { id: 'nazare', lat: 39.6, lon: -9.07 };
  const baleal = { id: 'baleal', lat: 39.37, lon: -9.34 };
  const moledo = { id: 'moledo', lat: 41.85, lon: -8.87 }; // fora da ponte
  const wmo = (buoys) => ({ hasWaveData: true, buoys });

  it('anexa Silleiro keyless aos spots da Costa de Prata quando a leitura ES está fresca', () => {
    const wave = esBridgeObservedWaveForSpot(wmo({ '6200084': silleiro }), nazare, { nowMs: NOW });
    expect(wave).not.toBeNull();
    expect(wave.waveHeight).toBeCloseTo(1.88, 2);
    expect(wave.source).toBe('wmo-buoy');
    expect(wave.bridge).toBe(true);
    expect(wave.stationCode).toBe('6200084');
    expect(wave.stationName).toBe('Cabo Silleiro');
    // A ponte bypassa o MAX_BUOY_ATTACH_KM (≈280 km reais) — mantém a distância honesta.
    expect(wave.distanceKm).toBeGreaterThan(200);
    expect(wave.bridgeNote).toContain('Cabo Silleiro');
    expect(MAX_BUOY_ATTACH_KM).toBe(200);
  });

  it('aplica-se aos três spots da ponte (nazaré/são-martinho-porto/baleal)', () => {
    const smp = { id: 'sao-martinho-porto', lat: 39.51, lon: -9.14 };
    for (const spot of [nazare, smp, baleal]) {
      expect(
        esBridgeObservedWaveForSpot(wmo({ '6200084': silleiro }), spot, { nowMs: NOW }),
      ).not.toBeNull();
    }
  });

  it('recusa spots fora da ponte (ex. moledo, já servido por Silleiro via mapping)', () => {
    expect(
      esBridgeObservedWaveForSpot(wmo({ '6200084': silleiro }), moledo, { nowMs: NOW }),
    ).toBeNull();
  });

  it('recusa leitura ES antiga (>6h)', () => {
    const stale = {
      ...silleiro,
      latest: { date: '2026-08-14T01:00:00Z', hs: 1.1 }, // 17h antes de NOW
    };
    expect(
      esBridgeObservedWaveForSpot(wmo({ '6200084': stale }), nazare, { nowMs: NOW }),
    ).toBeNull();
  });

  it('recusa sem boia Silleiro ou sem ficheiro', () => {
    expect(esBridgeObservedWaveForSpot(wmo({}), nazare, { nowMs: NOW })).toBeNull();
    expect(esBridgeObservedWaveForSpot(null, nazare, { nowMs: NOW })).toBeNull();
    expect(
      esBridgeObservedWaveForSpot(wmo({ '6200084': { ...silleiro, latest: null } }), nazare, {
        nowMs: NOW,
      }),
    ).toBeNull();
  });
});

describe('findUnmappedEsBuoys (cobertura geográfica desperdiçada)', () => {
  const archiveWith = (buoys) => ({ fetchedAt: 'x', buoys });
  const wmoWith = (buoys, spotMapping) => ({ fetchedAt: 'x', buoys, spotMapping });
  const withReadings = (n) => ({ readings: Array.from({ length: n }, (_, i) => ({ date: `2026-08-14T${i}:00:00Z`, hm0: 1 })) });

  it('sinaliza boia com leituras acumuladas mas sem nenhum spot mapeado', () => {
    const arc = archiveWith({
      '6200024': withReadings(22), // Bilbao
      '6200025': withReadings(22), // Cabo Peñas
      '6200083': withReadings(22), // Villano-Sisargas
      '6200084': withReadings(22), // Silleiro — mapeada
    });
    const wmo = wmoWith(
      {
        '6200024': { name: 'Bilbao' },
        '6200025': { name: 'Cabo Peñas' },
        '6200083': { name: 'Villano-Sisargas' },
        '6200084': { name: 'Cabo Silleiro' },
      },
      { moledo: { code: '6200084' }, afife: { code: '6200084' } },
    );
    const wasted = findUnmappedEsBuoys(arc, wmo);
    expect(wasted).toHaveLength(3);
    expect(wasted.map((w) => w.code).sort()).toEqual(['6200024', '6200025', '6200083']);
    expect(wasted[0]).toMatchObject({ name: 'Bilbao', readings: 22 });
  });

  it('não sinaliza boias mapeadas, nem sem leituras', () => {
    const arc = archiveWith({
      '6200084': withReadings(3),
      '6201079': { code: '6201079' }, // sem readings
    });
    const wmo = wmoWith({ '6200084': { name: 'Cabo Silleiro' } }, { faro: { code: '6200084' } });
    expect(findUnmappedEsBuoys(arc, wmo)).toHaveLength(0);
  });

  it('usa o nome do catálogo (fallback ao nome do arquivo, depois ao null)', () => {
    const arc = archiveWith({ '6200083': { name: 'Villano-Sisargas', ...withReadings(5) } });
    const arcNoName = archiveWith({ '6209999': withReadings(2) });
    const wmo = wmoWith({}, {});
    expect(findUnmappedEsBuoys(arc, wmo)[0].name).toBe('Villano-Sisargas');
    expect(findUnmappedEsBuoys(arcNoName, wmo)[0]).toMatchObject({ code: '6209999', name: null, readings: 2 });
  });

  it('devolve [] para entradas ausentes/inválidas', () => {
    expect(findUnmappedEsBuoys(null, null)).toEqual([]);
    expect(findUnmappedEsBuoys({ buoys: {} }, { spotMapping: {} })).toEqual([]);
    expect(findUnmappedEsBuoys({ buoys: { 1: { readings: [] } } }, { spotMapping: {} })).toEqual([]);
  });
});

describe('Rota PT keyless (Nazaré 6200199) para o forecast-skill', () => {
  it('classifica a boia PT como wmo-pt e as ES como wmo-es', () => {
    expect(PT_KEYLESS_WMO_CODES).toContain('6200199');
    expect(wmoOriginForWmoCode('6200199')).toBe('wmo-pt');
    // Qualquer outro código WMO (ES ou desconhecido) é tratado como ES.
    expect(wmoOriginForWmoCode('6200084')).toBe('wmo-es');
    expect(wmoOriginForWmoCode('9999999')).toBe('wmo-es');
  });

  it('acumula a PT E as ES no conjunto keyless (wmo-bias-archive)', () => {
    expect(KEYLESS_WMO_CODES).toEqual(
      expect.arrayContaining(['6200199', '6200084', '6200083', '6200085', '6200024', '6200025']),
    );
    // A PT não anula a rota ES (tudo único, sem duplicados).
    expect(new Set(KEYLESS_WMO_CODES).size).toBe(KEYLESS_WMO_CODES.length);
  });
});
