import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { carryOverForecast, applyCarryOver, MAX_CARRYOVER_AGE_HOURS } = require('../updateConditionsCarryover.js');
const { validateCoverage } = require('../updateConditionsHealth.js');

// Instante da run: 2026-11-19 15:00 UTC (o incidente foi de manhã).
const NOW = Date.parse('2026-11-19T15:00:00Z');

const forecastCovering = (untilIso) => {
  const hours = [];
  const end = Date.parse(untilIso);
  for (let t = Date.parse('2026-11-19T00:00:00Z'); t <= end; t += 3_600_000) {
    hours.push({ time: new Date(t).toISOString(), waveHeight: 1.4 });
  }
  return hours;
};

const previousEntry = (ageHours) => ({
  waveHeight: 1.4,
  windSpeed: 12,
  updatedAt: new Date(NOW - ageHours * 3_600_000).toISOString(),
});

describe('carryOverForecast', () => {
  it('reaproveita fetch anterior ≤12h com previsão ainda a cobrir o futuro', () => {
    const prev = previousEntry(4);
    const forecast = forecastCovering('2026-11-25T00:00:00Z');
    const carried = carryOverForecast({ previousConditionsEntry: prev, forecastJson: forecast, nowMs: NOW });
    expect(carried.carriedFromFetchedAt).toBe(prev.updatedAt);
    expect(carried.conditions.carriedOver).toBe(true);
    expect(carried.conditions.carriedFromFetchedAt).toBe(prev.updatedAt);
    expect(carried.conditions.updatedAt).toBe(prev.updatedAt); // dados são mesmo daquele instante
    expect(carried.conditions.waveHeight).toBe(1.4);
    expect(carried.forecast).toBe(forecast);
  });

  it('recusa fetch anterior mais velho que 12h', () => {
    const carried = carryOverForecast({
      previousConditionsEntry: previousEntry(MAX_CARRYOVER_AGE_HOURS + 0.1),
      forecastJson: forecastCovering('2026-11-25T00:00:00Z'),
      nowMs: NOW,
    });
    expect(carried).toBeNull();
  });

  it('recusa sem entrada anterior ou sem updatedAt (não dá para provar frescura)', () => {
    const forecast = forecastCovering('2026-11-25T00:00:00Z');
    expect(carryOverForecast({ previousConditionsEntry: null, forecastJson: forecast, nowMs: NOW })).toBeNull();
    expect(carryOverForecast({ previousConditionsEntry: { waveHeight: 1 }, forecastJson: forecast, nowMs: NOW })).toBeNull();
  });

  it('recusa previsão que já não cobre horas futuras', () => {
    const carried = carryOverForecast({
      previousConditionsEntry: previousEntry(4),
      forecastJson: forecastCovering('2026-11-19T10:00:00Z'),
      nowMs: NOW,
    });
    expect(carried).toBeNull();
  });

  it('recusa ficheiro vazio ou não-array', () => {
    const prev = previousEntry(4);
    expect(carryOverForecast({ previousConditionsEntry: prev, forecastJson: [], nowMs: NOW })).toBeNull();
    expect(carryOverForecast({ previousConditionsEntry: prev, forecastJson: null, nowMs: NOW })).toBeNull();
  });
});

describe('applyCarryOver', () => {
  const readMap = (files) => (id) => files[id] ?? null;

  it('spot no catálogo com fetch falhado e anterior recente → entra nos dois índices, marcado', () => {
    const spots = [{ id: 'moledo' }];
    const prevForecast = forecastCovering('2026-11-25T00:00:00Z');
    const previousConditions = { moledo: previousEntry(4) };
    const allConditions = {};
    const allForecasts = {};
    const log = { warn: vi.fn() };

    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts, previousConditions,
      readForecast: readMap({ moledo: prevForecast }), nowMs: NOW, log,
    });

    expect(carriedIds.has('moledo')).toBe(true);
    expect(allConditions.moledo.carriedOver).toBe(true);
    expect(allConditions.moledo.carriedFromFetchedAt).toBe(previousConditions.moledo.updatedAt);
    expect(allForecasts.moledo).toBe(prevForecast);
    // splitFiles: chave ⇔ ficheiro — os dois índices andam juntos.
    expect(Object.keys(allConditions).sort()).toEqual(Object.keys(allForecasts).sort());
    // log nomeado do carry-over
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('moledo'));
    expect(log.warn.mock.calls.some(([m]) => m.includes('carry-over'))).toBe(true);
  });

  it('spot com anterior >12h → não reaproveita (o espelho apaga o ficheiro depois)', () => {
    const spots = [{ id: 'afife' }];
    const previousConditions = { afife: previousEntry(13) };
    const allConditions = {};
    const allForecasts = {};
    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts, previousConditions,
      readForecast: readMap({ afife: forecastCovering('2026-11-25T00:00:00Z') }), nowMs: NOW, log: { warn: vi.fn() },
    });
    expect(carriedIds.size).toBe(0);
    expect(allConditions.afife).toBeUndefined();
    expect(allForecasts.afife).toBeUndefined();
    // keys ⇔ files continua consistente (ambos ausentes → ficheiro é apagado)
    expect(Object.keys(allConditions).sort()).toEqual(Object.keys(allForecasts).sort());
  });

  it('spot removido do catálogo → nada injectado (o espelho apaga como hoje)', () => {
    const spots = [{ id: 'guincho' }]; // rodanho saiu do catálogo
    const allConditions = {};
    const allForecasts = {};
    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts,
      previousConditions: { rodanho: previousEntry(1) },
      readForecast: readMap({ rodanho: forecastCovering('2026-11-25T00:00:00Z') }), nowMs: NOW, log: { warn: vi.fn() },
    });
    expect(carriedIds.size).toBe(0);
    expect(allConditions.rodanho).toBeUndefined();
  });

  it('não toca em spots com fetch OK nem em aliases', () => {
    const fresh = forecastCovering('2026-11-25T00:00:00Z');
    const spots = [{ id: 'a' }, { id: 'b', conditionsSource: 'a' }];
    const allConditions = { a: { waveHeight: 2 } };
    const allForecasts = { a: fresh };
    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts,
      previousConditions: { a: previousEntry(1), b: previousEntry(1) },
      readForecast: readMap({ a: fresh, b: fresh }), nowMs: NOW, log: { warn: vi.fn() },
    });
    expect(carriedIds.size).toBe(0);
    expect(allConditions.a.carriedOver).toBeUndefined();
    expect(allConditions.b).toBeUndefined(); // alias resolvido por applyAliasSpots, nunca por carry-over
  });

  it('um segundo carry-over consecutivo mantém carriedFromFetchedAt = updatedAt original', () => {
    const spots = [{ id: 'moledo' }];
    const prevForecast = forecastCovering('2026-11-25T00:00:00Z');
    // Run anterior já tinha reaproveitado: carriedFromFetchedAt = updatedAt =
    // instante do fetch original. Um segundo carry não pode «refrescar» a
    // idade dos dados — tem de continuar a apontar para o fetch real.
    const original = previousEntry(8);
    const previousConditions = {
      moledo: { ...original, carriedOver: true, carriedFromFetchedAt: original.updatedAt },
    };
    const allConditions = {};
    const allForecasts = {};
    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts, previousConditions,
      readForecast: readMap({ moledo: prevForecast }), nowMs: NOW, log: { warn: vi.fn() },
    });
    expect(carriedIds.has('moledo')).toBe(true);
    expect(allConditions.moledo.updatedAt).toBe(original.updatedAt);
    expect(allConditions.moledo.carriedFromFetchedAt).toBe(original.updatedAt);
  });

  it('o gate de coverage conta o carry-over como falha do fetch', () => {
    const spots = [{ id: 'ok' }, { id: 'moledo' }, { id: 'afife' }];
    const allConditions = { ok: { waveHeight: 2 } };
    const allForecasts = { ok: forecastCovering('2026-11-25T00:00:00Z') };
    const prevForecast = forecastCovering('2026-11-25T00:00:00Z');
    const carriedIds = applyCarryOver({
      spots, allConditions, allForecasts,
      previousConditions: { moledo: previousEntry(4), afife: previousEntry(20) },
      readForecast: readMap({ moledo: prevForecast, afife: prevForecast }),
      nowMs: NOW, log: { warn: vi.fn() },
    });
    const log = { warn: vi.fn() };
    const coverage = validateCoverage(spots, allConditions, log, { carriedIds });
    expect(carriedIds.has('moledo')).toBe(true);
    expect(coverage.failedPrimary.sort()).toEqual(['afife', 'moledo']); // moledo = falha, não sucesso
    expect(coverage.carriedPrimary).toEqual(['moledo']);
    expect(coverage.droppedPrimary).toEqual(['afife']);
    expect(coverage.okPrimary).toBe(1);
    expect(coverage.spotCount).toBe(2); // entrada carried existe em conditions.json
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 reaproveitado'));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 apagado'));
  });
});
