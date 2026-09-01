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
    const result = buildPipelineLayers({ metaRoot: 'root', previousMeta: { old: true }, loadBuoyLayerStatus: layer('loadBuoy'), applyBuoyLayerStreak: layer('buoy'), loadRadarLayerStatus: layer('loadRadar'), loadWarningsLayerStatus: layer('loadWarnings'), applyLayerStreak: layer('apply'), buildCoastalWarningsLayer: layer('coastal') });
    expect(result).toEqual({ buoyLayer: 'buoy', radarLayer: 'apply', warningsLayer: 'apply', coastalWarningsLayer: 'coastal' });
    expect(calls.map(([name]) => name)).toEqual(['loadBuoy', 'buoy', 'loadRadar', 'apply', 'loadWarnings', 'apply', 'coastal']);
  });
});
