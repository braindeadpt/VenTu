import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  parseSpotsFromFile,
  applyWaveBiasToRow,
  applyAliasSpots,
  resolveUseMultiModel,
  confidenceFromPrevious,
  createUsageCounter,
  fetchWithRetry,
  spots,
  MIN_SPOTS,
} = require('../../update-conditions.js');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.VENTU_MULTIMODEL;
  delete process.env.VENTU_MULTIMODEL_HOURS;
});

describe('parseSpotsFromFile (update-conditions)', () => {
  it('extrai id/lat/lon/region de todos os spots (185, sem duplicados)', () => {
    expect(spots.length).toBeGreaterThanOrEqual(MIN_SPOTS);
    expect(spots.length).toBe(185);
    const ids = new Set(spots.map((s) => s.id));
    expect(ids.size).toBe(spots.length);
    for (const s of spots) {
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lon)).toBe(true);
      expect(typeof s.region).toBe('string');
      expect(s.region.length).toBeGreaterThan(0);
    }
  });

  it('região extraída para um spot conhecido (Nazaré → Oeste)', () => {
    const nazare = spots.find((s) => s.id === 'nazare');
    expect(nazare?.region).toBe('Oeste');
  });

  it('identifica os 4 aliases (conditionsSource) e marca os primários sem essa flag', () => {
    const aliases = spots.filter((s) => s.conditionsSource);
    expect(aliases.map((a) => a.id).sort()).toEqual([
      'foil-esposende-piscinas',
      'foil-fao-cavado',
      'obidos-lagoon-foz',
      'obidos-lagoon-sul',
    ]);
    expect(aliases.every((a) => a.conditionsSource === 'esposende' || a.conditionsSource === 'obidos-lagoon')).toBe(
      true,
    );
    const primary = spots.filter((s) => !s.conditionsSource);
    expect(primary.length).toBe(181);
    expect(primary.some((s) => s.conditionsSource)).toBe(false);
  });
});

describe('applyWaveBiasToRow (update-conditions)', () => {
  const waveBias = {
    regions: {
      'Oeste': { n: 120, me: 0.4, mae: 0.5, rmse: 0.6, corr: 0.9 },
      'Fraca': { n: 10, me: 0.4 }, // n < 30 → não aplica
    },
  };

  it('aplica o viés e carrega a meta waveBias na row (corrigido → row)', () => {
    const row = applyWaveBiasToRow({ waveHeight: 1.5 }, 'Oeste', waveBias, true);
    expect(row.waveHeight).toBe(1.9);
    expect(row.waveHeightRaw).toBe(1.5);
    expect(row.waveBias).toEqual({ region: 'Oeste', me: 0.4, n: 120, deltaM: 0.4 });
  });

  it('devolve cópia da row sem waveBias quando desligado / sem região / amostra fraca', () => {
    expect(applyWaveBiasToRow({ waveHeight: 1.5 }, 'Oeste', waveBias, false)).toEqual({ waveHeight: 1.5 });
    expect(applyWaveBiasToRow({ waveHeight: 1.5 }, undefined, waveBias, true)).toEqual({ waveHeight: 1.5 });
    expect(applyWaveBiasToRow({ waveHeight: 1.5 }, 'Fraca', waveBias, true)).toEqual({ waveHeight: 1.5 });
    // Não muta o objecto original
    const input = { waveHeight: 1.5 };
    applyWaveBiasToRow(input, 'Oeste', waveBias, true);
    expect(input).toEqual({ waveHeight: 1.5 });
  });
});

describe('applyAliasSpots (update-conditions)', () => {
  const sourceRow = {
    waveHeight: 1.9,
    waveHeightRaw: 1.5,
    waveBias: { region: 'Oeste', me: 0.4, n: 120, deltaM: 0.4 },
    windSpeed: 5,
  };
  const sourceForecast = [{ time: '2026-08-14T12:00', waveHeight: 1.9 }];

  it('copia a row da fonte para o alias com o waveBias incluído (deep copy independente)', () => {
    const conditions = { 'nazare': { ...sourceRow } };
    const forecasts = { 'nazare': sourceForecast };
    const copied = applyAliasSpots(
      [{ id: 'alias-x', conditionsSource: 'nazare' }],
      conditions,
      forecasts,
    );
    expect(copied).toEqual(['alias-x']);
    expect(conditions['alias-x']).toEqual(sourceRow);
    expect(forecasts['alias-x']).toBe(sourceForecast); // forecast partilhado por referência

    // Independência: mutar o alias não toca a fonte.
    conditions['alias-x'].waveHeight = 99;
    expect(conditions['nazare'].waveHeight).toBe(1.9);
  });

  it('copia também para aliases múltiplos da mesma fonte', () => {
    const conditions = { 'obidos-lagoon': { ...sourceRow, waveHeight: 2.1 } };
    const forecasts = {};
    const copied = applyAliasSpots(
      [
        { id: 'obidos-lagoon-sul', conditionsSource: 'obidos-lagoon' },
        { id: 'obidos-lagoon-foz', conditionsSource: 'obidos-lagoon' },
      ],
      conditions,
      forecasts,
    );
    expect(copied).toEqual(['obidos-lagoon-sul', 'obidos-lagoon-foz']);
    expect(conditions['obidos-lagoon-sul'].waveHeight).toBe(2.1);
    expect(conditions['obidos-lagoon-foz'].waveHeight).toBe(2.1);
  });

  it('salta aliases cuja fonte não existe (sem crash)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const conditions = {};
    const copied = applyAliasSpots(
      [{ id: 'orphan', conditionsSource: 'missing' }],
      conditions,
      {},
    );
    expect(copied).toEqual([]);
    expect(conditions['orphan']).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('resolveUseMultiModel / confiança herdada (modo dia vs noite)', () => {
  // Verão (WEST, UTC+1): a hora de Lisboa = UTC + 1h. Controlamos o relógio
  // para os testes ficarem determinísticos em qualquer altura do ano.
  const atLisbon = (utcIso) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(utcIso));
  };

  it('sem env: âncora de dia (12h Lisboa) → multi-modelo; dia fora da âncora e noite → best_match', () => {
    atLisbon('2026-08-14T11:00:00Z'); // Lisboa 12:00 — âncora
    expect(resolveUseMultiModel()).toBe(true);

    atLisbon('2026-08-14T09:00:00Z'); // Lisboa 10:00 — dia best_match (confiança herdada)
    expect(resolveUseMultiModel()).toBe(false);

    atLisbon('2026-08-13T23:00:00Z'); // Lisboa 00:00 — noite best_match
    expect(resolveUseMultiModel()).toBe(false);
  });

  it('VENTU_MULTIMODEL_HOURS sobrepõe as âncoras através do resolveUseMultiModel', () => {
    process.env.VENTU_MULTIMODEL_HOURS = '10,14';

    atLisbon('2026-08-14T09:00:00Z'); // Lisboa 10:00 — agora é multi-modelo
    expect(resolveUseMultiModel()).toBe(true);

    atLisbon('2026-08-14T13:00:00Z'); // Lisboa 14:00 — idem
    expect(resolveUseMultiModel()).toBe(true);

    atLisbon('2026-08-14T11:00:00Z'); // Lisboa 12:00 — fora do override → best_match
    expect(resolveUseMultiModel()).toBe(false);
  });

  it('VENTU_MULTIMODEL=true/false força o modo (override do schedule)', () => {
    process.env.VENTU_MULTIMODEL = 'true';
    atLisbon('2026-08-13T23:00:00Z'); // noite — forçado a multi-modelo
    expect(resolveUseMultiModel()).toBe(true);

    process.env.VENTU_MULTIMODEL = '0';
    atLisbon('2026-08-14T11:00:00Z'); // âncora de dia — forçado a best_match
    expect(resolveUseMultiModel()).toBe(false);
  });

  it('confidenceFromPrevious: herda a confiança/spreads do run anterior com degraded: true', () => {
    const prev = {
      confidence: 'alta',
      confidenceDetail: {
        waveSpread: 0.4,
        windSpread: 2,
        waveSpreadPct: 15,
        windSpreadPct: 8,
        combinedSpreadPct: 12,
        degraded: false,
      },
      dailyConfidence: [{ day: '2026-08-14', confidence: 'alta' }],
    };
    const out = confidenceFromPrevious(prev);
    expect(out.confidence).toBe('alta');
    expect(out.confidenceDetail).toEqual({
      waveSpread: 0.4,
      windSpread: 2,
      waveSpreadPct: 15,
      windSpreadPct: 8,
      combinedSpreadPct: 12,
      degraded: true,
    });
    expect(out.dailyConfidence).toEqual(prev.dailyConfidence);
    // Não muta o run anterior.
    expect(prev.confidenceDetail.degraded).toBe(false);
  });

  it('confidenceFromPrevious: sem run anterior → média, spreads zero, degraded (confiança reinicia)', () => {
    const out = confidenceFromPrevious(undefined);
    expect(out.confidence).toBe('média');
    expect(out.confidenceDetail).toEqual({
      waveSpread: 0,
      windSpread: 0,
      waveSpreadPct: 0,
      windSpreadPct: 0,
      combinedSpreadPct: 0,
      degraded: true,
    });
    expect(out.dailyConfidence).toEqual([]);
  });

  it('confidenceFromPrevious: run anterior sem confidenceDetail → confiança reinicia (média) + degraded', () => {
    // Sem confidenceDetail o run anterior não tem base para herdar — a
    // confiança reinicia para média (o detail é a fonte de verdade).
    const out = confidenceFromPrevious({ confidence: 'baixa', dailyConfidence: [] });
    expect(out.confidence).toBe('média');
    expect(out.confidenceDetail).toEqual({
      waveSpread: 0,
      windSpread: 0,
      waveSpreadPct: 0,
      windSpreadPct: 0,
      combinedSpreadPct: 0,
      degraded: true,
    });
    expect(out.dailyConfidence).toEqual([]);
  });
});

describe('createUsageCounter / fetchWithRetry (uso real ponderado da Open-Meteo)', () => {
  it('record(weight): soma ponderadas por modelo e conta os pedidos HTTP reais', () => {
    const usage = createUsageCounter();
    usage.record(1); // best_match marine
    usage.record(1); // best_match weather
    usage.record(4); // multi-model wave (4 modelos num pedido)
    usage.record(4); // multi-model wind (4 modelos num pedido)
    expect(usage.weightedCalls).toBe(10); // 10 ponderadas/spot — modo dia
    expect(usage.requests).toBe(4);
    expect(usage.retries).toBe(0);
    expect(usage.spotsFetched).toBe(0);
  });

  it('fetchWithRetry conta cada pedido HTTP (inclui retries 429) com o peso do modelo', async () => {
    const usage = createUsageCounter();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response('rate limited', { status: 429 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const p = fetchWithRetry('https://api.open-meteo.com/x', 3, 10, usage, 4);
    await vi.advanceTimersByTimeAsync(1000);
    const out = await p;

    expect(out).toEqual({ ok: true });
    expect(calls).toBe(2); // 1º 429 + 1º sucesso
    expect(usage.requests).toBe(2);
    expect(usage.weightedCalls).toBe(8); // 4 ponderadas × 2 pedidos
    expect(usage.retries).toBe(1); // o 429 contou como retry
  });

  it('fetchWithRetry conta também os pedidos que falham de vez (sem sucesso)', async () => {
    const usage = createUsageCounter();
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const p = fetchWithRetry('https://api.open-meteo.com/x', 2, 10, usage, 1).catch((e) => e.message);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await p;

    expect(err).toContain('HTTP 500');
    expect(usage.requests).toBe(2); // 2 tentativas consumiram quota
    expect(usage.weightedCalls).toBe(2);
    expect(usage.retries).toBe(1);
  });

  it('modo noite = 2 ponderadas/spot (best_match marine + weather)', () => {
    const usage = createUsageCounter();
    usage.record(1);
    usage.record(1);
    expect(usage.weightedCalls).toBe(2);
  });
});
