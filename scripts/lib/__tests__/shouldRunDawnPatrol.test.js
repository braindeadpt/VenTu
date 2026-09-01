import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveDawnGate, DAWN_RUN_LISBON_HOUR } = require('../../should-run-dawn-patrol.js');

afterEach(() => {
  delete process.env.GITHUB_EVENT_NAME;
});

describe('resolveDawnGate (dawn-patrol após update-data do mesmo dia)', () => {
  it('Lisbon 04:00 (workflow_run do update-data) → run — a última corrida antes das 06:00', () => {
    expect(resolveDawnGate({ hour: 4, eventName: 'workflow_run' })).toBe('run');
    expect(DAWN_RUN_LISBON_HOUR).toBe(4);
  });

  it('qualquer outra hora diária (00h, 06h, 08h, 17h…) → skip', () => {
    for (const hour of [0, 1, 2, 3, 5, 6, 7, 8, 12, 17, 20, 23]) {
      expect(resolveDawnGate({ hour, eventName: 'workflow_run' })).toBe('skip');
    }
  });

  it('workflow_dispatch manual corre sempre, independentemente da hora', () => {
    expect(resolveDawnGate({ hour: 15, eventName: 'workflow_dispatch' })).toBe('run');
    expect(resolveDawnGate({ hour: 4, eventName: 'workflow_dispatch' })).toBe('run');
  });

  it('usa GITHUB_EVENT_NAME do ambiente quando não passado', () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_run';
    expect(resolveDawnGate({ hour: 4 })).toBe('run');
    expect(resolveDawnGate({ hour: 6 })).toBe('skip');
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    expect(resolveDawnGate({ hour: 10 })).toBe('run');
  });

  it('sem evento (local) só corre na janela das 04:00', () => {
    expect(resolveDawnGate({ hour: 4, eventName: null })).toBe('run');
    expect(resolveDawnGate({ hour: 8, eventName: null })).toBe('skip');
  });
});
