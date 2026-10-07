import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { evaluateDataCadence } = require('../dataCadence.js');
const {
  STALE_ALERT_HOURS_DAY,
  STALE_ALERT_HOURS_NIGHT,
} = require('../pipelineStaleness.js');

// Summer dates: Lisbon = UTC+1. 12:00Z = 13:00 Lisbon (daytime),
// 02:00Z = 03:00 Lisbon (night).
const DAY = new Date('2026-07-04T12:00:00Z').getTime();
const NIGHT = new Date('2026-07-04T02:00:00Z').getTime();

describe('evaluateDataCadence', () => {
  it('shares the SAME thresholds as the meta-file heartbeat (no divergence)', () => {
    expect(STALE_ALERT_HOURS_DAY).toBe(3);
    expect(STALE_ALERT_HOURS_NIGHT).toBe(5);
    // Sane defaults: fresh commit in daytime must not be stale.
    const s = evaluateDataCadence(DAY - 1 * 3600_000, DAY);
    expect(s.stale).toBe(false);
  });

  it('fresh commit (1h old) is not stale in daytime', () => {
    const s = evaluateDataCadence(DAY - 1 * 3600_000, DAY);
    expect(s.stale).toBe(false);
    expect(s.isDaytime).toBe(true);
    expect(s.thresholdHours).toBe(STALE_ALERT_HOURS_DAY);
    expect(s.ageHours).toBeCloseTo(1, 1);
    expect(s.unknown).toBe(false);
  });

  it('commit 3.2h old in daytime IS stale (threshold 3h)', () => {
    const s = evaluateDataCadence(DAY - 3.2 * 3600_000, DAY);
    expect(s.stale).toBe(true);
    expect(s.ageHours).toBeCloseTo(3.2, 1);
  });

  it('night uses the 5h threshold — 4.5h old commit is NOT stale at 03:00 Lisbon', () => {
    const s = evaluateDataCadence(NIGHT - 4.5 * 3600_000, NIGHT);
    expect(s.isDaytime).toBe(false);
    expect(s.thresholdHours).toBe(STALE_ALERT_HOURS_NIGHT);
    expect(s.stale).toBe(false);
  });

  it('night — 6h old commit IS stale (a full slot pair missed)', () => {
    const s = evaluateDataCadence(NIGHT - 6 * 3600_000, NIGHT);
    expect(s.stale).toBe(true);
  });

  it('missing commit time (API failure) is the deadest signal — stale', () => {
    const s = evaluateDataCadence(null, DAY);
    expect(s.stale).toBe(true);
    expect(s.unknown).toBe(true);
    expect(s.ageHours).toBeNull();
  });

  it('invalid commit time is treated as unknown and stale', () => {
    expect(evaluateDataCadence(NaN, DAY).stale).toBe(true);
    expect(evaluateDataCadence(undefined, DAY).stale).toBe(true);
  });

  it('future commit time (clock skew) clamps age to 0 — not stale', () => {
    const s = evaluateDataCadence(DAY + 2 * 3600_000, DAY);
    expect(s.stale).toBe(false);
    expect(s.ageHours).toBe(0);
  });

  it('thresholds are overridable (ops tuning without code changes)', () => {
    const t = DAY - 4 * 3600_000;
    expect(evaluateDataCadence(t, DAY, { dayHours: 5 }).stale).toBe(false);
    expect(evaluateDataCadence(t, DAY, { dayHours: 3 }).stale).toBe(true);
  });
});

// 7 out 2026: o cadence contava QUALQUER commit em public/data/** — um commit
// de news.json (13:10) fez-o ler «fresco» e fechar a issue data-stale aberta
// pelo staleness-alert, com as condições mortas desde as 07:32. O sinal tem de
// ser o ficheiro que só o commit de condições reescreve.
describe('sinal do cadence heartbeat', () => {
  const src = readFileSync(
    path.join(process.cwd(), 'scripts', 'check-data-cadence.js'),
    'utf8',
  );

  it('mede o commit de pipeline-meta.json, não a pasta public/data inteira', () => {
    expect(src).toMatch(/const DATA_PATH = 'public\/data\/pipeline-meta\.json';/);
    expect(src).not.toMatch(/const DATA_PATH = 'public\/data';/);
  });

  it('usa DATA_PATH no filtro da API de commits', () => {
    expect(src).toMatch(/commits\?path=\$\{DATA_PATH\}/);
  });
});
