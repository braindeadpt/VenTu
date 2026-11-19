import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateCoverage, assertCoverage, buildPipelineLayers } = require('../updateConditionsHealth.js');

describe('updateConditionsHealth', () => {
  it('calculates primary coverage while excluding aliases', () => {
    const spots = [{ id: 'a' }, { id: 'b', conditionsSource: 'a' }, { id: 'c' }];
    const coverage = validateCoverage(spots, { a: {}, c: {} });
    expect(coverage.primaryIds).toEqual(['a', 'c']);
    expect(coverage.failedPrimary).toEqual([]);
    expect(coverage.okPrimary).toBe(2);
    expect(coverage.spotCount).toBe(2);
  });

  it('conta carry-over como falha do fetch e nomeia reaproveitados/apagados', () => {
    const spots = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const log = { warn: vi.fn() };
    const coverage = validateCoverage(
      spots,
      { a: {}, b: { carriedOver: true, carriedFromFetchedAt: '2026-11-19T09:00:00Z' } },
      log,
      { carriedIds: new Set(['b']) },
    );
    expect(coverage.failedPrimary).toEqual(['b', 'c']);
    expect(coverage.carriedPrimary).toEqual(['b']);
    expect(coverage.droppedPrimary).toEqual(['c']);
    expect(coverage.okPrimary).toBe(1); // b não conta como sucesso
    expect(coverage.spotCount).toBe(2); // mas a entrada fica em conditions.json
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 reaproveitado(s)'));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 apagado(s)'));
  });

  it('asserts empty or insufficient coverage without writing', () => {
    const exit = vi.fn();
    const log = { error: vi.fn() };
    assertCoverage({ primaryIds: ['a', 'b'], failedPrimary: ['a'], minOk: 2, okPrimary: 1, spotCount: 1 }, exit, log);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('assembles all layer states through their existing owners', () => {
    const calls = [];
    const layer = (name) => (...args) => { calls.push([name, ...args]); return name; };
    const result = buildPipelineLayers({ metaRoot: 'root', previousMeta: { old: true }, loadBuoyLayerStatus: layer('loadBuoy'), applyBuoyLayerStreak: layer('buoy'), loadRadarLayerStatus: layer('loadRadar'), loadSatLayerStatus: layer('loadSat'), loadWarningsLayerStatus: layer('loadWarnings'), applyLayerStreak: layer('apply'), buildCoastalWarningsLayer: layer('coastal'), loadTidesLayerStatus: layer('loadTides') });
    expect(result).toEqual({ buoyLayer: 'buoy', radarLayer: 'apply', satLayer: 'apply', warningsLayer: 'apply', coastalWarningsLayer: 'coastal', tideLayer: 'apply' });
    expect(calls.map(([name]) => name)).toEqual(['loadBuoy', 'buoy', 'loadRadar', 'apply', 'loadSat', 'apply', 'loadWarnings', 'apply', 'coastal', 'loadTides', 'apply']);
  });
});
