import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  resolveObsWorkerBase,
  buildObsProbeUrl,
  buildHealthUrl,
  evaluateObsPayload,
  DEFAULT_OBS_WORKER_URL,
} = require('../obsWorkerHealth.js');

describe('obsWorkerHealth', () => {
  it('resolveObsWorkerBase corta barra final e tem default', () => {
    expect(resolveObsWorkerBase('')).toBe(DEFAULT_OBS_WORKER_URL);
    expect(resolveObsWorkerBase('https://x.workers.dev/')).toBe('https://x.workers.dev');
  });

  it('buildObsProbeUrl aponta /obs com lat/lon de Matosinhos', () => {
    const u = new URL(buildObsProbeUrl('https://example.workers.dev/'));
    expect(u.pathname).toBe('/obs');
    expect(u.searchParams.get('lat')).toBe('41.18');
    expect(u.searchParams.get('lon')).toBe('-8.7');
  });

  it('buildHealthUrl aponta /health', () => {
    expect(buildHealthUrl('https://example.workers.dev')).toBe(
      'https://example.workers.dev/health',
    );
  });

  it('evaluateObsPayload aceita ecowitt/ipma/metar', () => {
    expect(
      evaluateObsPayload({
        observed: { windSpeedKt: 0, source: 'ecowitt' },
      }).ok,
    ).toBe(true);
    expect(
      evaluateObsPayload({
        observed: { windSpeedKt: 1, source: 'ipma' },
      }).source,
    ).toBe('ipma');
  });

  it('evaluateObsPayload recusa null / source inválida', () => {
    expect(evaluateObsPayload({ observed: null }).ok).toBe(false);
    expect(evaluateObsPayload({ observed: { windSpeedKt: 1, source: 'ih' } }).ok).toBe(false);
    expect(evaluateObsPayload({ observed: { source: 'ipma' } }).ok).toBe(false);
  });
});
