import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  DAILY_WINDOW_DAYS,
  MIN_DAILY_PAIRS,
  emptyDailyArchive,
  readDailyArchive,
  writeDailyArchive,
  deriveDailyVerdicts,
  mergeDailyVerdicts,
  pruneDailyArchive,
  buildDailyTrend,
  resolveIhStationForWmo,
  toIhCoherenceRows,
  buildIhCoherencePair,
  consecutiveIncoherentDays,
} = require('../buoyCoherenceDaily.js');

const CODES = ['6200084', '6201077']; // Silleiro × Porto

/** Hourly archive entry (buoy-coherence-archive.json shape). */
function hourly(dateHour, esHs, ptHs, codes = CODES, pair = 'Cabo Silleiro × Porto') {
  return { pair, codes, hour: `${dateHour}`, esHs, ptHs, date: `${dateHour}:00:00Z` };
}

describe('deriveDailyVerdicts (veredicto por dia/par a partir do arquivo horário)', () => {
  it('agrupa por dia+par, deriva n/mean|Δ|/veredicto e ordena por dia', () => {
    const archive = { pairs: [
      hourly('2026-08-14T08', 1.6, 1.5),
      hourly('2026-08-14T09', 1.7, 1.6),
      hourly('2026-08-15T08', 1.9, 1.8),
      hourly('2026-08-15T08', 0.8, 0.9, ['6200085', '6201079'], 'Golfo de Cádiz × Faro'),
    ] };
    const days = deriveDailyVerdicts(archive);
    expect(days.map((d) => d.day)).toEqual(['2026-08-14', '2026-08-15']);
    const d14 = days[0].pairs.find((p) => p.codes.join('|') === CODES.join('|'));
    expect(d14.n).toBe(2);
    expect(d14.verdict).toBe('insufficient'); // < MIN_DAILY_PAIRS(3)
    expect(d14.pair).toBe('Cabo Silleiro × Porto');
  });

  it('o veredicto diário usa o floor DIÁRIO (MIN_DAILY_PAIRS), não o da janela acumulada', () => {
    const archive = { pairs: [
      hourly('2026-08-14T08', 1.0, 3.0),
      hourly('2026-08-14T09', 1.1, 3.2),
      hourly('2026-08-14T10', 1.2, 3.1),
    ] };
    const days = deriveDailyVerdicts(archive);
    // 3 horas divergentes no mesmo dia → incoherent (permsa 4-6h do dia bastam
    // para o veredicto DIÁRIO), apesar de MIN_ACCUMULATED_PAIRS=10 na janela.
    const d = days[0].pairs[0];
    expect(d.n).toBe(3);
    expect(d.verdict).toBe('incoherent');
  });

  it('ignora pares sem hour/codes válidos e nunca lança com archive vazio', () => {
    expect(deriveDailyVerdicts({ pairs: [{ esHs: 1 }] })).toEqual([]);
    expect(deriveDailyVerdicts({})).toEqual([]);
    expect(deriveDailyVerdicts(null)).toEqual([]);
  });
});

describe('mergeDailyVerdicts (dedup por dia, actualiza o dia)', () => {
  it('acumula dias e substitui o veredicto antigo do mesmo dia', () => {
    const a = emptyDailyArchive();
    mergeDailyVerdicts(a, [
      { day: '2026-08-14', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'insufficient', n: 2, meanAbsDeltaM: 0.1, meanDeltaM: 0.1 }] },
    ]);
    expect(a.days).toHaveLength(1);
    // Dia 14 ganha mais horas na run seguinte → verdict substituído (mais completo).
    mergeDailyVerdicts(a, [
      { day: '2026-08-14', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'coherent', n: 5, meanAbsDeltaM: 0.2, meanDeltaM: 0.1 }] },
      { day: '2026-08-15', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'coherent', n: 4, meanAbsDeltaM: 0.3, meanDeltaM: 0.2 }] },
    ]);
    expect(a.days).toHaveLength(2);
    const d14 = a.days.find((d) => d.day === '2026-08-14');
    expect(d14.pairs[0].verdict).toBe('coherent');
    expect(d14.pairs[0].n).toBe(5);
  });

  it('sem dias novos → 0 e nunca lança', () => {
    const a = emptyDailyArchive();
    expect(mergeDailyVerdicts(a, [])).toBe(0);
    expect(mergeDailyVerdicts(a, null)).toBe(0);
    expect(a.days).toEqual([]);
  });
});

describe('buildDailyTrend (rollup por par — padrões sazonais)', () => {
  it('conta veredictos por par e calcula a ratio de incoherent', () => {
    const a = emptyDailyArchive();
    mergeDailyVerdicts(a, [
      { day: '2026-01-05', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'incoherent', n: 12 }] },
      { day: '2026-01-06', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'incoherent', n: 12 }] },
      { day: '2026-07-20', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'coherent', n: 11 }] },
      { day: '2026-07-21', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'coherent', n: 11 }] },
    ]);
    const trend = buildDailyTrend(a);
    const t = trend[CODES.join('|')];
    expect(t.days).toBe(4);
    expect(t.incoherent).toBe(2);
    expect(t.coherent).toBe(2);
    // 2 incoherent / 4 não-insufficient = 0.5
    expect(t.incoherentRatio).toBe(0.5);
  });

  it('ratio ignora dias insufficient (n klepsilon abaixo do floor)', () => {
    const a = emptyDailyArchive();
    mergeDailyVerdicts(a, [
      { day: '2026-07-20', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'coherent', n: 11 }] },
      { day: '2026-07-21', pairs: [{ codes: CODES, pair: 'Cabo Silleiro × Porto', verdict: 'insufficient', n: 2 }] },
    ]);
    const t = buildDailyTrend(a)[CODES.join('|')];
    expect(t.days).toBe(2);
    expect(t.incoherentRatio).toBe(0); // só 1 dia não-insufficient, incoherent 0
  });
});

describe('pruneDailyArchive + persistência', () => {
  it('mantém a janela LONGA (muito mais que a horária) e remove dias antigos', () => {
    const a = emptyDailyArchive();
    mergeDailyVerdicts(a, [
      { day: '2026-01-05', pairs: [{ codes: CODES, pair: 'P', verdict: 'incoherent', n: 12 }] },
      { day: '2026-08-14', pairs: [{ codes: CODES, pair: 'P', verdict: 'coherent', n: 12 }] },
    ]);
    pruneDailyArchive(a, Date.parse('2026-08-16T00:00:00Z'), DAILY_WINDOW_DAYS);
    expect(a.days.map((d) => d.day)).toEqual(['2026-08-14']);
  });

  it('read/write round-trip e arquivo ausente/corrompido → vazio', () => {
    const p = path.join(os.tmpdir(), 'coherence-daily-test.json');
    const a = emptyDailyArchive();
    mergeDailyVerdicts(a, [{ day: '2026-08-14', pairs: [{ codes: CODES, pair: 'P', verdict: 'coherent', n: 12 }] }]);
    writeDailyArchive(a, p);
    expect(readDailyArchive(p).days).toHaveLength(1);
    fs.rmSync(p, { force: true });
    expect(readDailyArchive(p)).toEqual(emptyDailyArchive());
    fs.writeFileSync(p, '{corrupt');
    expect(readDailyArchive(p).days).toEqual([]);
    fs.rmSync(p, { force: true });
  });

  it('janela diária é 180 dias', () => {
    expect(DAILY_WINDOW_DAYS).toBe(180);
  });
});

describe('ES×IH (alimentar a coerência com as boias IH via IH_API_KEY)', () => {
  const stations = {
    '4': { idEst: 4, name: 'CSA92/D', wmoId: 6201077, lat: 41.1, lon: -8.9 },
    '20': { idEst: 20, name: 'CSA82/D', wmoId: 6201079, lat: 37.0, lon: -8.9 },
    // Sem wmo_id — nunca é resolvida.
    '99': { idEst: 99, name: 'Sem WMO', lat: 40.0, lon: -9.0 },
  };

  it('resolveIhStationForWmo encontra a estação IH pelo wmo_id (6201077→CSA92/D, 6201079→CSA82/D)', () => {
    expect(resolveIhStationForWmo(stations, 6201077)?.idEst).toBe(4);
    expect(resolveIhStationForWmo(stations, '6201079')?.idEst).toBe(20);
    expect(resolveIhStationForWmo(stations, '6200089')).toBeNull();
    expect(resolveIhStationForWmo(stations, undefined)).toBeNull();
    expect(resolveIhStationForWmo(null, '6201077')).toBeNull();
    // Estação sem wmo_id não resolve mesmo com match numérico.
    expect(resolveIhStationForWmo(stations, '99')).toBeNull();
  });

  it('toIhCoherenceRows converte {date,hm0} em {date,hs} com lat/lon e descarta inválidos', () => {
    const st = { lat: 41.1, lon: -8.9 };
    const rows = [
      { date: '2026-08-14T08:11:00Z', hm0: 1.6 },
      { date: '2026-08-14T09:05:00Z', hm0: 2.0 },
      { date: 'lixo', hm0: 3.0 }, // date inválida → descartada
      { date: '2026-08-14T10:00:00Z', hm0: -1 }, // hm0 negativo → descartada
      { date: '2026-08-14T11:00:00Z' }, // sem hm0 → descartada
    ];
    const out = toIhCoherenceRows(rows, st);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ date: '2026-08-14T08:11:00.000Z', hs: 1.6, lat: 41.1, lon: -8.9 });
  });

  it('buildIhCoherencePair monta o fragmento de config ptSource=ih; null sem ES ou sem séries IH', () => {
    const es = { code: '6200084', name: 'Cabo Silleiro', lat: 42.1, lon: -9.4, rows: [{ date: 'x', hs: 1, lat: 42.1, lon: -9.4 }] };
    const pair = buildIhCoherencePair(es, stations['4'], [
      { date: '2026-08-14T08:00:00Z', hm0: 1.5 },
      { date: '2026-08-15T08:00:00Z', hm0: 1.7 },
    ]);
    expect(pair.ptSource).toBe('ih');
    expect(pair.a.code).toBe('6200084');
    expect(pair.b.code).toBe('4');
    expect(pair.b.name).toBe('CSA92/D');
    expect(pair.b.rows[0].hs).toBe(1.5);
    // b.code é String(idEst) — compatível com a dedup por par+hora do archive.

    // Sem ES ou sem leituras IH usáveis → null (não inventa o par).
    expect(buildIhCoherencePair(null, stations['4'], [{ date: 'x', hm0: 1 }])).toBeNull();
    expect(buildIhCoherencePair(es, stations['4'], [])).toBeNull();
    expect(buildIhCoherencePair(es, stations['4'], [{ date: 'lixo', hm0: 1 }])).toBeNull();
    expect(buildIhCoherencePair(es, null, [{ date: 'x', hm0: 1 }])).toBeNull();
  });

  it('os códigos ES×IH diferem dos ES×WMO — não colidem no dedup do archive', () => {
    const es = { code: '6200084', name: 'Cabo Silleiro', lat: 42.1, lon: -9.4, rows: [{ date: 'x', hs: 1, lat: 42.1, lon: -9.4 }] };
    // ES×WMO usa o código WMO PT (6201077); ES×IH usa o idEst IH (4).
    const ih = buildIhCoherencePair(es, stations['4'], [{ date: '2026-08-14T08:00:00Z', hm0: 1.5 }]);
    expect([es.code, '6201077'].join('|')).not.toBe([ih.a.code, ih.b.code].join('|'));
    expect([ih.a.code, ih.b.code].join('|')).toBe('6200084|4');
  });
});

describe('consecutiveIncoherentDays (dias seguidos de incoerência ES×PT para a confiança IH)', () => {
  /** Pairs for a given day. */
  function dayPairs(day, verdicts) {
    return {
      day,
      pairs: verdicts.map(([codes, verdict]) => ({ codes, verdict })),
    };
  }

  it('conta dias consecutivos incoherent do par (mais recente primeiro)', () => {
    const daily = {
      fetchedAt: 'x',
      days: [
        dayPairs('2026-08-10', [[CODES, 'coherent']]),
        dayPairs('2026-08-11', [[CODES, 'incoherent']]),
        dayPairs('2026-08-12', [[CODES, 'incoherent']]),
        dayPairs('2026-08-13', [[CODES, 'incoherent']]),
      ],
    };
    const r = consecutiveIncoherentDays(daily, CODES);
    expect(r.days).toBe(3);
    expect(r.firstDay).toBe('2026-08-11');
    expect(r.lastDay).toBe('2026-08-13');
  });

  it('interrompe a sequência quando um dia do par não está em incoherent ou falta', () => {
    // Dia mais recente incoherent, depois um gap (sem dados) → apenas 1.
    const withGap = {
      days: [
        dayPairs('2026-08-12', [[CODES, 'coherent']]),
        dayPairs('2026-08-13', [[CODES, 'incoherent']]),
      ],
    };
    expect(consecutiveIncoherentDays(withGap, CODES).days).toBe(1);

    // Sem par nesse dia → interrompe (não assume incoerência num dia sem dados).
    const missing = {
      days: [
        dayPairs('2026-08-11', [[CODES, 'coherent']]),
        dayPairs('2026-08-12', []), // par ausente no dia seguinte
        dayPairs('2026-08-13', [[CODES, 'incoherent']]),
      ],
    };
    expect(consecutiveIncoherentDays(missing, CODES).days).toBe(1);
  });

  it('devolve 0 para archive vazio, sem dias, ou códigos inválidos', () => {
    expect(consecutiveIncoherentDays({ days: [] }, CODES).days).toBe(0);
    expect(consecutiveIncoherentDays(null, CODES).days).toBe(0);
    expect(consecutiveIncoherentDays({ days: [dayPairs('2026-08-13', [[CODES, 'incoherent']])] }, null).days).toBe(0);
    expect(
      consecutiveIncoherentDays({ days: [dayPairs('2026-08-13', [[CODES, 'incoherent']])] }, ['outro|par']).days,
    ).toBe(0);
  });

  it('distingue código diferente e respeita a ordem canónica do par', () => {
    const daily = {
      days: [dayPairs('2026-08-13', [[['6200084', '6201077'], 'incoherent']])],
    };
    // O par é keyed por codes.join('|') — o merge usa sempre a ordem canónica
    // (ES primeiro, PT depois), por isso a ordem invertida NÃO resolve.
    expect(
      consecutiveIncoherentDays({ days: [dayPairs('2026-08-13', [[['6201077', '6200084'], 'incoherent']])] }, CODES).days,
    ).toBe(0);
    // Mesma ordem → resolve.
    expect(consecutiveIncoherentDays(daily, CODES).days).toBe(1);
    // Par diferente (outro ES) → 0.
    expect(
      consecutiveIncoherentDays({ days: [dayPairs('2026-08-13', [[['6219999', '6201077'], 'incoherent']])] }, CODES).days,
    ).toBe(0);
  });
});