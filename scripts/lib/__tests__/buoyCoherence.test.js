import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  MIN_PAIRS,
  MEAN_DELTA_OK_M,
  MEAN_DELTA_BAD_M,
  bucketByUtcHour,
  alignOnHours,
  pairStats,
  verdictFor,
  buildCoherenceReport,
  incoherentEsCodes,
  buildRegionSourceAudit,
  MIN_CALIBRATION_N,
  crossBorderCalibration,
  applyCrossBorderCalibration,
  GATE_HISTORY_WINDOW_DAYS,
  emptyGateHistory,
  mergeGateRun,
  gateRefusalReason,
  isEsCodeGated,
} = require('../buoyCoherence.js');

describe('bucketByUtcHour', () => {
  it('agrupa por hora UTC e fica com a leitura mais recente dentro da hora', () => {
    const rows = [
      { date: '2026-08-14T08:02:00.000Z', hs: 1.1 },
      { date: '2026-08-14T08:31:00.000Z', hs: 1.3 },
      { date: '2026-08-14T09:00:00.000Z', hs: 1.4 },
    ];
    const by = bucketByUtcHour(rows);
    expect([...by.keys()]).toEqual(['2026-08-14T08', '2026-08-14T09']);
    expect(by.get('2026-08-14T08').hs).toBe(1.3); // a mais recente ganha
    expect(by.get('2026-08-14T09').hs).toBe(1.4);
  });

  it('ignora datas inválidas e sem formato de hora', () => {
    expect(bucketByUtcHour([{ date: 'lixo', hs: 1 }, { hs: 2 }]).size).toBe(0);
    expect(bucketByUtcHour([]).size).toBe(0);
  });
});

describe('alignOnHours', () => {
  const es = [
    { date: '2026-08-14T04:00:00Z', hs: 1.2 },
    { date: '2026-08-14T05:00:00Z', hs: 1.4 },
    { date: '2026-08-14T07:00:00Z', hs: 1.6 }, // hora sem PT
  ];
  const pt = [
    { date: '2026-08-14T04:25:00Z', hs: 1.5 }, // bucketing 04
    { date: '2026-08-14T05:12:00Z', hs: 1.6 }, // bucketing 05
  ];

  it('alinha nas horas comuns (ES horário × PT esparso) ordenadas', () => {
    const pairs = alignOnHours(es, pt);
    expect(pairs).toEqual([
      { hour: '2026-08-14T04', a: 1.2, b: 1.5 },
      { hour: '2026-08-14T05', a: 1.4, b: 1.6 },
    ]);
  });

  it('devolve [] sem horas comuns', () => {
    expect(alignOnHours(es, [])).toEqual([]);
    expect(alignOnHours([], pt)).toEqual([]);
  });
});

describe('pairStats', () => {
  it('calcula n / mean Δ / mean |Δ| / max |Δ| / corr', () => {
    const stats = pairStats([
      { hour: 'h1', a: 1.2, b: 1.5 },
      { hour: 'h2', a: 1.4, b: 1.7 },
      { hour: 'h3', a: 1.6, b: 1.9 },
    ]);
    // Δ = b − a: 0.3 em todas (offset constante → corr 1)
    expect(stats.n).toBe(3);
    expect(stats.meanDeltaM).toBe(0.3);
    expect(stats.meanAbsDeltaM).toBe(0.3);
    expect(stats.maxAbsDeltaM).toBe(0.3);
    expect(typeof stats.corr).toBe('number');
    expect(stats.corr).toBeCloseTo(1, 5);
  });

  it('corr null com < 3 pares e null com lista vazia', () => {
    const two = pairStats([{ a: 1, b: 1.1 }, { a: 2, b: 2.2 }]);
    expect(two.corr).toBeNull();
    expect(pairStats([])).toBeNull();
  });
});

describe('verdictFor', () => {
  it('gates: n mínimo, ok ≤ 0.8 m, bad ≥ 1.5 m', () => {
    expect(MIN_PAIRS).toBe(3);
    expect(MEAN_DELTA_OK_M).toBe(0.8);
    expect(MEAN_DELTA_BAD_M).toBe(1.5);
    expect(verdictFor({ n: 3, meanAbsDeltaM: 0.4 })).toBe('coherent');
    expect(verdictFor({ n: 3, meanAbsDeltaM: 1.2 })).toBe('review');
    expect(verdictFor({ n: 3, meanAbsDeltaM: 1.6 })).toBe('incoherent');
    expect(verdictFor({ n: 2, meanAbsDeltaM: 0.4 })).toBe('insufficient');
    expect(verdictFor(null)).toBe('insufficient');
  });

  it('aceita limiares custom', () => {
    expect(verdictFor({ n: 3, meanAbsDeltaM: 0.9 }, { okM: 1.0 })).toBe('coherent');
    expect(verdictFor({ n: 3, meanAbsDeltaM: 1.2 }, { minPairs: 5 })).toBe('insufficient');
  });
});

describe('buildCoherenceReport', () => {
  const silleiro = {
    code: '6200084',
    name: 'Cabo Silleiro',
    lat: 42.12,
    lon: -9.43,
    rows: [
      { date: '2026-08-14T04:00:00Z', hs: 1.2 },
      { date: '2026-08-14T05:00:00Z', hs: 1.4 },
      { date: '2026-08-14T06:00:00Z', hs: 1.6 },
      { date: '2026-08-14T07:00:00Z', hs: 1.7 },
    ],
  };
  const porto = {
    code: '6201077',
    name: 'Datawell ao largo do Porto',
    lat: 41.32,
    lon: -8.98,
    rows: [
      { date: '2026-08-14T04:25:00Z', hs: 1.5 },
      { date: '2026-08-14T05:10:00Z', hs: 1.6 },
      { date: '2026-08-14T06:30:00Z', hs: 1.8 },
      { date: '2026-08-14T07:02:00Z', hs: 1.9 },
    ],
  };

  it('report com pares alinhados, distância real e horas keyed por código', () => {
    const report = buildCoherenceReport([{ a: silleiro, b: porto }]);
    expect(report.overall).toBe('coherent');
    const p = report.pairs[0];
    expect(p.codes).toEqual(['6200084', '6201077']);
    expect(p.n).toBe(4);
    // Silleiro (42.12, -9.43) → Porto (41.32, -8.98) ≈ 96 km
    expect(p.distanceKm).toBeGreaterThan(90);
    expect(p.distanceKm).toBeLessThan(110);
    expect(p.hours[0]).toEqual({
      hour: '2026-08-14T04',
      '6200084': 1.2,
      '6201077': 1.5,
    });
    expect(p.verdict).toBe('coherent');
  });

  it('overall incoherent quando um par diverge muito', () => {
    const wild = {
      ...silleiro,
      rows: [
        { date: '2026-08-14T04:00:00Z', hs: 3.0 },
        { date: '2026-08-14T05:00:00Z', hs: 3.2 },
        { date: '2026-08-14T06:00:00Z', hs: 3.4 },
        { date: '2026-08-14T07:00:00Z', hs: 3.6 },
      ],
    };
    const report = buildCoherenceReport([
      { a: silleiro, b: porto },
      { a: wild, b: porto },
    ]);
    expect(report.pairs[0].verdict).toBe('coherent');
    expect(report.pairs[1].verdict).toBe('incoherent');
    expect(report.overall).toBe('incoherent');
  });

  it('overall insufficient quando não há horas comuns suficientes', () => {
    const lonely = {
      ...silleiro,
      rows: [{ date: '2026-08-14T23:00:00Z', hs: 1.2 }],
    };
    const report = buildCoherenceReport([{ a: lonely, b: porto }]);
    expect(report.pairs[0].verdict).toBe('insufficient');
    expect(report.overall).toBe('insufficient');
  });
});

describe('incoherentEsCodes (gate da atribuição regional)', () => {
  const ES = ['6200084', '6200083', '6200085'];

  it('devolve os códigos ES de pares incoherent (dedup + sort)', () => {
    const report = {
      pairs: [
        { codes: ['6200084', '6201077'], verdict: 'incoherent' },
        { codes: ['6200085', '6201079'], verdict: 'incoherent' },
        { codes: ['6200084', '6201079'], verdict: 'incoherent' }, // dedup
        { codes: ['6200083', '6201077'], verdict: 'coherent' },
      ],
    };
    expect(incoherentEsCodes(report, ES)).toEqual(['6200084', '6200085']);
  });

  it('ignora review / insufficient / coherent', () => {
    const report = {
      pairs: [
        { codes: ['6200084', '6201077'], verdict: 'review' },
        { codes: ['6200085', '6201079'], verdict: 'insufficient' },
        { codes: ['6200083', '6201077'], verdict: 'coherent' },
      ],
    };
    expect(incoherentEsCodes(report, ES)).toEqual([]);
  });

  it('filtra apenas os códigos da rota ES (ignora a boia PT)', () => {
    const report = {
      pairs: [{ codes: ['6200084', '6201077'], verdict: 'incoherent' }],
    };
    expect(incoherentEsCodes(report, ES)).toEqual(['6200084']);
  });

  it('sem relatório ou sem pares → vazio (sem gate)', () => {
    expect(incoherentEsCodes(null, ES)).toEqual([]);
    expect(incoherentEsCodes({}, ES)).toEqual([]);
    expect(incoherentEsCodes({ pairs: [] }, ES)).toEqual([]);
    expect(incoherentEsCodes({ pairs: [{ codes: ['6200084'], verdict: 'incoherent' }] }, ES)).toEqual(
      ['6200084'],
    );
  });
});

describe('crossBorderCalibration (viés sistemático ES×PT)', () => {
  // Formato do relatório real (buoy-coherence.json): ME = mean(PT − ES).
  const report = {
    pairs: [
      {
        pair: 'Cabo Silleiro × Datawell ao largo de Faro',
        codes: ['6200084', '6201079'],
        n: 4,
        meanDeltaM: -0.9,
        meanAbsDeltaM: 0.9,
        verdict: 'review',
      },
      {
        pair: 'Cabo Silleiro × Datawell ao largo do Porto',
        codes: ['6200084', '6201077'],
        n: 5,
        meanDeltaM: -0.2,
        meanAbsDeltaM: 0.2,
        verdict: 'coherent',
      },
      {
        pair: 'Villano-Sisargas × Datawell ao largo de Faro',
        codes: ['6200083', '6201079'],
        n: 2,
        meanDeltaM: -0.8,
        meanAbsDeltaM: 0.8,
        verdict: 'insufficient',
      },
      {
        pair: 'Golfo de Cádiz × Datawell ao largo de Faro',
        codes: ['6200085', '6201079'],
        n: 6,
        meanDeltaM: -1.9,
        meanAbsDeltaM: 1.9,
        verdict: 'incoherent',
      },
    ],
  };

  it('devolve o ME/n do par (Silleiro×Faro, review com n ≥ 3)', () => {
    const cal = crossBorderCalibration(report, '6200084', '6201079');
    expect(cal).toEqual({
      me: -0.9,
      n: 4,
      verdict: 'review',
      pair: 'Cabo Silleiro × Datawell ao largo de Faro',
    });
  });

  it('funciona com par coherent (Silleiro×Porto) e com códigos string/number', () => {
    const cal = crossBorderCalibration(report, '6200084', 6201077);
    expect(cal.me).toBe(-0.2);
    expect(cal.n).toBe(5);
    expect(cal.verdict).toBe('coherent');
  });

  it('null com n abaixo do mínimo (insufficient) e com incoherent', () => {
    expect(crossBorderCalibration(report, '6200083', '6201079')).toBeNull();
    expect(crossBorderCalibration(report, '6200085', '6201079')).toBeNull();
  });

  it('null sem relatório, sem par para o par de códigos, ou sem meanDeltaM', () => {
    expect(crossBorderCalibration(null, '6200084', '6201079')).toBeNull();
    expect(crossBorderCalibration({ pairs: [] }, '6200084', '6201079')).toBeNull();
    expect(crossBorderCalibration(report, '6200084', '6201077')).not.toBeNull();
    expect(crossBorderCalibration(report, '6200084', '6202400')).toBeNull(); // Açores nunca par ES
    expect(
      crossBorderCalibration({ pairs: [{ codes: ['6200084', '6201079'], n: 3, verdict: 'coherent' }] }, '6200084', '6201079'),
    ).toBeNull(); // sem meanDeltaM
  });

  it('respeita minN custom (override)', () => {
    const cal = crossBorderCalibration(report, '6200083', '6201079', { minN: 2 });
    expect(cal).not.toBeNull();
    expect(cal.n).toBe(2);
    expect(MIN_CALIBRATION_N).toBe(3);
  });
});

describe('applyCrossBorderCalibration (aplicar o viés à leitura ES)', () => {
  const silleiroWave = {
    waveHeight: 2.3,
    wavePeriod: 11,
    stationName: 'Cabo Silleiro',
    distanceKm: 96.8,
    observedAt: '2026-08-14T12:00:00.000Z',
    source: 'wmo-buoy',
    skill: { me: 0.4, n: 12 },
  };
  const cal = { me: -0.9, n: 4, verdict: 'review', pair: 'Cabo Silleiro × Datawell ao largo de Faro' };

  it('recalibra a altura (raw + ME), preserva o resto e marca a correcção', () => {
    const out = applyCrossBorderCalibration(silleiroWave, cal);
    expect(out.waveHeight).toBe(1.4); // 2.3 − 0.9
    expect(out.calibration).toEqual({
      me: -0.9,
      n: 4,
      verdict: 'review',
      from: 'Cabo Silleiro × Datawell ao largo de Faro',
      rawHeight: 2.3,
      deltaM: -0.9,
    });
    expect(out.skill).toEqual({ me: 0.4, n: 12 }); // skill preservado
    expect(out.stationName).toBe('Cabo Silleiro');
    expect(silleiroWave.waveHeight).toBe(2.3); // input nunca mutado
  });

  it('clampa a ≥0.1 m e arredonda a 1 casa', () => {
    const tiny = { ...silleiroWave, waveHeight: 0.6 };
    const out = applyCrossBorderCalibration(tiny, { ...cal, me: -0.8 });
    expect(out.waveHeight).toBe(0.1);
    expect(out.calibration.deltaM).toBe(-0.5);
  });

  it('devolve o payload inalterado sem calibração, sem ME, ou com delta desprezável', () => {
    expect(applyCrossBorderCalibration(silleiroWave, null)).toBe(silleiroWave);
    expect(applyCrossBorderCalibration(silleiroWave, { ...cal, me: NaN })).toBe(silleiroWave);
    expect(applyCrossBorderCalibration(null, cal)).toBeNull();
    // ME +0.02 m numa leitura 2.3 → delta 0.0 arredondado → sem correcção.
    expect(applyCrossBorderCalibration(silleiroWave, { ...cal, me: 0.02 })).toBe(silleiroWave);
  });
});

describe('buildRegionSourceAudit (fonte anexada vs boia mais próxima)', () => {
  const spots = [
    { id: 'moledo', region: 'Oeste' },
    { id: 'faro', region: 'Algarve' },
    { id: 'zavial', region: 'Algarve' },
    { id: 'sem-regiao', region: undefined },
  ];

  it('agrega por região: contagens, vencedor por fonte e distâncias', () => {
    const conditions = {
      moledo: {
        observedWave: { source: 'ih-buoy', distanceKm: 60 },
        observedWaveMeta: { reason: 'ih-fresh', ihDistanceKm: 60, wmoDistanceKm: 56 },
      },
      faro: {
        observedWave: { source: 'wmo-buoy', distanceKm: 95 },
        observedWaveMeta: { reason: 'wmo-only', ihDistanceKm: 120, wmoDistanceKm: 95 },
      },
      zavial: {
        observedWave: { source: 'ih-buoy', distanceKm: 100 },
        observedWaveMeta: { reason: 'ih-fresh', ihDistanceKm: 100, wmoDistanceKm: 160 },
      },
    };
    const regions = buildRegionSourceAudit(conditions, spots);
    expect(Object.keys(regions).sort()).toEqual(['Algarve', 'Oeste']);

    const oeste = regions['Oeste'];
    expect(oeste.spotCount).toBe(1);
    expect(oeste.withObservedWave).toBe(1);
    expect(oeste.bySource).toEqual({ 'ih-buoy': 1 });
    // IH anexado a 60 km mas a WMO está a 56 — anomalia (não-closest).
    expect(oeste.audited).toBe(1);
    expect(oeste.attachedNotClosest).toBe(1);
    expect(oeste.notClosest).toEqual([
      { spot: 'moledo', winner: 'ih-buoy', reason: 'ih-fresh', attachedKm: 60, altKm: 56 },
    ]);

    const algarve = regions['Algarve'];
    expect(algarve.spotCount).toBe(2);
    expect(algarve.withObservedWave).toBe(2);
    expect(algarve.bySource).toEqual({ 'wmo-buoy': 1, 'ih-buoy': 1 });
    expect(algarve.attachedIsClosest).toBe(2);
    expect(algarve.attachedNotClosest).toBe(0);
    expect(algarve.notClosest).toEqual([]);
  });

  it('agrega a referência PT usada na calibração por par ES→PT dentro da região', () => {
    const conditions = {
      faro: {
        observedWave: { source: 'wmo-buoy', distanceKm: 95 },
        observedWaveMeta: { reason: 'wmo-only', ihDistanceKm: 120, wmoDistanceKm: 95 },
      },
      zavial: {
        observedWave: { source: 'wmo-buoy', distanceKm: 95 },
        observedWaveMeta: { reason: 'wmo-only', ihDistanceKm: 130, wmoDistanceKm: 95 },
      },
    };
    // O merge recolheu, por spot calibrado, a referência PT (6201079 Faro) que
    // recalibrou a leitura ES (6200084 Silleiro) — a auditoria expõe o par.
    const calibrationRefs = new Map([
      [
        'faro',
        {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '6201079',
          ptRefName: 'Faro',
          ptRefArea: 'Algarve',
          pair: 'Cabo Silleiro × Faro',
          me: -0.9,
          n: 5,
        },
      ],
      [
        'zavial',
        {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '6201079',
          ptRefName: 'Faro',
          ptRefArea: 'Algarve',
          pair: 'Cabo Silleiro × Faro',
          me: -0.9,
          n: 5,
        },
      ],
    ]);
    const regions = buildRegionSourceAudit(conditions, spots, calibrationRefs);
    // faro e zavial são ambos Algarve (ver fixtures do describe) → um só par.
    const algarve = regions['Algarve'];
    expect(algarve.calibrated).toBe(2);
    const ref = algarve.calibrationRefs['6200084→6201079'];
    expect(ref).toMatchObject({
      esCode: '6200084',
      esName: 'Cabo Silleiro',
      ptRefCode: '6201079',
      ptRefName: 'Faro',
      ptRefArea: 'Algarve',
      pair: 'Cabo Silleiro × Faro',
      me: -0.9,
      n: 5,
    });
    expect(ref.spots).toEqual(expect.arrayContaining(['faro', 'zavial']));
  });

  it('ignora refs sem ptRefCode e não cria calibrationRefs sem calibração', () => {
    const conditions = {
      moledo: {
        observedWave: { source: 'ih-buoy', distanceKm: 60 },
        observedWaveMeta: { reason: 'ih-fresh', ihDistanceKm: 60, wmoDistanceKm: 56 },
      },
    };
    const regions = buildRegionSourceAudit(
      conditions,
      spots,
      new Map([['moledo', { esCode: '6200084', ptRefCode: null }]]),
    );
    expect(regions['Oeste']).toMatchObject({ calibrated: 0, calibrationRefs: {} });
  });

  it('conta onlySource quando a alternativa não tem distância (uma fonte apenas)', () => {
    const conditions = {
      moledo: {
        observedWave: { source: 'wmo-buoy', distanceKm: 56 },
        observedWaveMeta: { reason: 'wmo-only' },
      },
    };
    const regions = buildRegionSourceAudit(conditions, spots);
    expect(regions['Oeste']).toMatchObject({ withObservedWave: 1, audited: 0, onlySource: 1 });
  });

  it('ignora spots sem região; mantém a região com cobertura zero; nunca lança', () => {
    const conditions = {
      moledo: {},
      'sem-regiao': {
        observedWave: { source: 'ih-buoy', distanceKm: 10 },
        observedWaveMeta: { reason: 'ih-fresh', ihDistanceKm: 10, wmoDistanceKm: 20 },
      },
    };
    const regions = buildRegionSourceAudit(conditions, spots);
    // 'sem-regiao' fica de fora; Oeste conta o spot mas sem observedWave.
    expect(Object.keys(regions)).toEqual(['Oeste']);
    expect(regions['Oeste']).toMatchObject({ spotCount: 1, withObservedWave: 0, onlySource: 0 });
    expect(buildRegionSourceAudit(null, spots)).toEqual({});
    expect(buildRegionSourceAudit({}, [])).toEqual({});
  });
});

describe('mergeGateRun (histórico acumulado de recusas por boia ES)', () => {
  const NOW = Date.UTC(2026, 7, 15, 12); // 2026-08-15

  it('acumula uma recusa nova num dia, com contagem de spots e razão', () => {
    const h = mergeGateRun(
      emptyGateHistory(),
      [{ code: '6200084', name: 'Cabo Silleiro', spots: 4, reason: 'Cabo Silleiro × Porto', verdict: 'incoherent' }],
      '2026-08-15',
      { nowMs: NOW },
    );
    expect(h.windowDays).toBe(GATE_HISTORY_WINDOW_DAYS);
    expect(h.lastUpdated).toBe(new Date(NOW).toISOString());
    const r = h.byCode['6200084'];
    expect(r.name).toBe('Cabo Silleiro');
    expect(r.dayCount).toBe(1);
    expect(r.totalSpots).toBe(4);
    expect(r.events).toEqual([
      { day: '2026-08-15', spots: 4, reason: 'Cabo Silleiro × Porto', verdict: 'incoherent' },
    ]);
    expect(r.firstDay).toBe('2026-08-15');
    expect(r.lastDay).toBe('2026-08-15');
  });

  it('dedup por dia: o mesmo dia sobrescreve, dias novos acumulam; input nunca é mutado', () => {
    const first = mergeGateRun(
      null,
      [{ code: '6200084', name: 'Cabo Silleiro', spots: 3 }],
      '2026-08-13',
      { nowMs: NOW },
    );
    const second = mergeGateRun(
      first,
      [{ code: '6200084', name: 'Cabo Silleiro', spots: 4 }],
      '2026-08-13', // mesmo dia → reescreve (diferença +1 spot? não: substitui)
      { nowMs: NOW },
    );
    const third = mergeGateRun(
      second,
      [{ code: '6200084', name: 'Cabo Silleiro', spots: 2 }],
      '2026-08-14',
      { nowMs: NOW },
    );
    const r = third.byCode['6200084'];
    expect(r.dayCount).toBe(2);
    expect(r.totalSpots).toBe(6); // 4 (dia 13 sobrescrito) + 2 (dia 14)
    expect(r.firstDay).toBe('2026-08-13');
    expect(r.lastDay).toBe('2026-08-14');
    // Input não mutado.
    expect(first.byCode['6200084'].totalSpots).toBe(3);
  });

  it('acumula várias boias independentemente e preserva código sem refusa repetida', () => {
    const h = mergeGateRun(
      null,
      [
        { code: '6200084', name: 'Cabo Silleiro', spots: 2 },
        { code: '6201119', name: 'Villano', spots: 1 },
      ],
      '2026-08-15',
      { nowMs: NOW },
    );
    expect(Object.keys(h.byCode).sort()).toEqual(['6200084', '6201119']);
    expect(h.byCode['6201119'].dayCount).toBe(1);
    expect(h.byCode['6201119'].totalSpots).toBe(1);
  });

  it('faz prune de eventos fora da janela', () => {
    const old = new Date(Date.UTC(2025, 8, 1)).toISOString();
    const h = mergeGateRun(
      {
        windowDays: 30,
        byCode: {
          '6200084': {
            code: '6200084',
            name: 'Cabo Silleiro',
            totalSpots: 1,
            dayCount: 1,
            firstDay: old.slice(0, 10),
            lastDay: old.slice(0, 10),
            events: [{ day: old.slice(0, 10), spots: 1 }],
          },
        },
      },
      [{ code: '6200084', name: 'Cabo Silleiro', spots: 2 }],
      '2026-08-15',
      { nowMs: NOW, windowDays: 30 },
    );
    const r = h.byCode['6200084'];
    // O evento velho (>30d) saiu; só o de hoje fica.
    expect(r.events.map((e) => e.day)).toEqual(['2026-08-15']);
    expect(r.dayCount).toBe(1);
    expect(r.totalSpots).toBe(2);
  });

  it('ignora refusa sem código; devolve block vazio para history inválido', () => {
    const h = mergeGateRun(null, [{ code: null, spots: 1 }], '2026-08-15', { nowMs: NOW });
    expect(Object.keys(h.byCode)).toEqual([]);
    const h2 = mergeGateRun({ nope: 1 }, [], '2026-08-15', { nowMs: NOW });
    expect(Object.keys(h2.byCode)).toEqual([]);
  });
});

describe('gateRefusalReason (porque é que uma boia ES foi recusada)', () => {
  const report = {
    pairs: [
      { codes: ['6200084', '6201077'], verdict: 'incoherent', pair: 'Cabo Silleiro × Porto' },
      { codes: ['6200084', '6201079'], verdict: 'coherent', pair: 'Cabo Silleiro × Faro' },
      { codes: ['6201119', '6201077'], verdict: 'incoherent', pair: 'Villano × Porto' },
    ],
  };

  it('lista as etiquetas dos pares incoherent de um código ES', () => {
    expect(gateRefusalReason(report, '6200084')).toBe('Cabo Silleiro × Porto');
    expect(gateRefusalReason(report, '6201119')).toBe('Villano × Porto');
  });

  it('devolve string vazia quando o código não tem nenhum par incoherent', () => {
    expect(gateRefusalReason(report, '6209999')).toBe('');
    expect(gateRefusalReason(report, '6201119')).toContain('Villano');
    expect(gateRefusalReason(null, '6200084')).toBe('');
  });
});

describe('isEsCodeGated (gate puro do merge por spot)', () => {
  const ES = ['6200084', '6201119'];
  const report = {
    pairs: [
      { codes: ['6200084', '6201077'], verdict: 'incoherent' },
      { codes: ['6200083', '6201077'], verdict: 'coherent' },
    ],
  };

  it('devolve true só para código ES com par incoherent', () => {
    expect(isEsCodeGated(report, ES, '6200084')).toBe(true);
    expect(isEsCodeGated(report, ES, '6200083')).toBe(false);
    expect(isEsCodeGated(report, ES, '6201119')).toBe(false); // presente mas sem par incoherent
  });

  it('trata string/number e null/undefined como não-gated', () => {
    expect(isEsCodeGated(report, ES, 6200084)).toBe(true); // number equivalente
    expect(isEsCodeGated(report, ES, null)).toBe(false);
    expect(isEsCodeGated(report, ES, undefined)).toBe(false);
    expect(isEsCodeGated(report, ES, '')).toBe(false);
  });

  it('consistente com incoherentEsCodes e sem report → false', () => {
    expect(isEsCodeGated(null, ES, '6200084')).toBe(false);
    expect(isEsCodeGated({}, ES, '6200084')).toBe(false);
    expect(isEsCodeGated({ pairs: [] }, ES, '6200084')).toBe(false);
    // Mesma resposta do conjunto que o merge constrói para o warn.
    expect(incoherentEsCodes(report, ES).includes('6200084')).toBe(
      isEsCodeGated(report, ES, '6200084'),
    );
  });
});

describe('Par Silleiro×Nazaré (6200084×6200199) — referência PT da Costa de Prata', () => {
  // O PAIRS do check-buoy-coherence agora valida o NW contra a Nazaré Costeira
  // WMO (6200199), além das Datawell de Porto/Faro — capaz de correr mesmo sem
  // essas (boias do Norte esparsas/stale).
  const checkScript = require('../../check-buoy-coherence.js');
  const ES = ['6200084', '6200083', '6200085'];

  it('o PAIRS inclui Cabo Silleiro × Nazaré Costeira', () => {
    expect(checkScript.PAIRS).toContainEqual({ a: '6200084', b: '6200199' });
  });

  it('um par incoherent Silleiro×Nazaré faz o gate disparar sobre o Silleiro (sem Porto)', () => {
    const report = {
      pairs: [{ codes: ['6200084', '6200199'], verdict: 'incoherent', pair: 'Cabo Silleiro × Nazaré Costeira (WMO)' }],
    };
    expect(incoherentEsCodes(report, ES)).toEqual(['6200084']);
    expect(isEsCodeGated(report, ES, '6200084')).toBe(true);
    expect(gateRefusalReason(report, '6200084')).toContain('Cabo Silleiro');
    // A calibração ES→PT para este par fica indisponível (verdict incoherent).
    expect(
      crossBorderCalibration(report, '6200084', '6200199'),
    ).toBeNull();
  });

  it('um par coerente Silleiro×Nazaré permite a calibração com a referência PT da Costa de Prata', () => {
    const report = {
      pairs: [
        {
          codes: ['6200084', '6200199'],
          n: 12,
          meanDeltaM: 0.4,
          verdict: 'coherent',
          pair: 'Cabo Silleiro × Nazaré Costeira (WMO)',
        },
      ],
    };
    expect(isEsCodeGated(report, ES, '6200084')).toBe(false);
    expect(crossBorderCalibration(report, '6200084', '6200199')).toEqual({
      me: 0.4,
      n: 12,
      verdict: 'coherent',
      pair: 'Cabo Silleiro × Nazaré Costeira (WMO)',
    });
  });
});

