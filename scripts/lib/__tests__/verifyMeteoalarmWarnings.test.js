/**
 * Unit tests for scripts/verify-meteoalarm-warnings.js — o gate do workflow que
 * falha o job (só com token) quando o warning.json fica source:'meteoalarm'
 * mas sem avisos activos (IPMA em baixo E fallback MeteoAlarm vazio = dupla
 * falha da camada de segurança).
 *
 * Cobre a função pura verifyMeteoAlarmLayer (PASS/FAIL por condição) — o exit 1
 * do CLI é derivado directamente dela.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifyMeteoAlarmLayer, METEOALARM_SOURCE } = require('../../verify-meteoalarm-warnings.js');

const meteoalarm = (warnings) => ({
  source: 'meteoalarm',
  fetchedAt: '2026-08-31T06:00:00Z',
  warnings,
  spotWarnings: {},
});

describe('verifyMeteoAlarmLayer', () => {
  it('FAIL: source meteoalarm com warnings vazio (o caso a detectar)', () => {
    const { ok, problems, source, warningCount } = verifyMeteoAlarmLayer(meteoalarm([]));
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('source:"meteoalarm" mas sem avisos activos');
    expect(source).toBe('meteoalarm');
    expect(warningCount).toBe(0);
  });

  it('FAIL: source meteoalarm sem campo warnings (tratado como 0)', () => {
    const { ok } = verifyMeteoAlarmLayer({ source: 'meteoalarm', fetchedAt: 'x' });
    expect(ok).toBe(false);
  });

  it('PASS: meteoalarm com avisos não-vazios', () => {
    const { ok, warningCount } = verifyMeteoAlarmLayer(
      meteoalarm([{ id: 'a' }, { id: 'b' }]),
    );
    expect(ok).toBe(true);
    expect(warningCount).toBe(2);
  });

  it('PASS: source ipma (primária a servir) — o gate não se aplica, mesmo sem avisos', () => {
    const { ok } = verifyMeteoAlarmLayer({ source: 'ipma', warnings: [] });
    expect(ok).toBe(true);
  });

  it('PASS: payload null/ilegível não é um fallback meteoalarm vazio (devolve ok)', () => {
    expect(verifyMeteoAlarmLayer(null).ok).toBe(true);
    expect(verifyMeteoAlarmLayer(undefined).ok).toBe(true);
  });

  it('constante do gate: source meteoalarm', () => {
    expect(METEOALARM_SOURCE).toBe('meteoalarm');
  });
});