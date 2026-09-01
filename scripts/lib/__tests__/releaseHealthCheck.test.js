import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildChecklist, classifyConfigured } = require('../../release-health-check.js');

describe('release health checklist', () => {
  it('classifies all credential states', () => {
    expect(classifyConfigured(['A', 'B'], {})).toBe('missing');
    expect(classifyConfigured(['A', 'B'], { A: 'set' })).toBe('degraded');
    expect(classifyConfigured(['A', 'B'], { A: 'set', B: 'set' })).toBe('healthy');
    expect(classifyConfigured(['A', 'B'], { A: 'set' }, { anyOf: true })).toBe('healthy');
    expect(classifyConfigured(['A', 'B'], {}, { anyOf: true })).toBe('missing');
  });

  it('reports required integration credentials without exposing values', () => {
    const items = buildChecklist({
      IH_API_KEY: 'secret',
      METEOGATE_API_KEY: 'token',
      METEOALARM_API_KEY: 'token-2',
      ECOWITT_APPLICATION_KEY: 'app',
      ECOWITT_API_KEY: 'key',
      ECOWITT_MAC: 'mac',
    });
    expect(items.find((item) => item.id === 'ih')).toMatchObject({ status: 'healthy', configured: 1 });
    expect(items.find((item) => item.id === 'meteoalarm')).toMatchObject({ status: 'healthy', configured: 2 });
    expect(items.find((item) => item.id === 'ecowitt')).toMatchObject({ status: 'healthy', configured: 3 });
    expect(items.find((item) => item.id === 'resend')).toMatchObject({ status: 'missing', configured: 0 });
    expect(JSON.stringify(items)).not.toContain('secret');
    expect(JSON.stringify(items)).not.toContain('token');
  });

  it('MeteoGate alone is healthy — METEOALARM_API_KEY is optional', () => {
    const items = buildChecklist({ METEOGATE_API_KEY: 'token' });
    expect(items.find((item) => item.id === 'meteoalarm')).toMatchObject({
      status: 'healthy',
      configured: 1,
    });
  });
});
