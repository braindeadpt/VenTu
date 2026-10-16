/**
 * Unit tests for scripts/verify-meteoalarm-warnings.js — o gate do workflow que
 * falha o job (só com token) quando o warning.json fica source:'meteoalarm'
 * mas sem avisos activos (IPMA em baixo E fallback MeteoAlarm vazio = dupla
 * falha da camada de segurança).
 *
 * Cobre a função pura verifyMeteoAlarmLayer (PASS/FAIL por condição) e a
 * degradação (repõe o anterior marcado stale, ::warning::, exit 0) — antes o exit 1
 * do CLI é derivado directamente dela.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifyMeteoAlarmLayer, restorePreviousWarnings, METEOALARM_SOURCE } = require('../../verify-meteoalarm-warnings.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
describe('restorePreviousWarnings (falha → anterior marcado stale)', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const prev = {
    source: 'ipma',
    fetchedAt: '2026-10-16T09:00:00Z',
    warnings: [
      { areaCode: 'LSB', type: 'Agitação Marítima', level: 'yellow', endTime: '2026-10-16T18:00:00Z' },
      { areaCode: 'PTO', type: 'Vento', level: 'yellow', endTime: '2026-10-16T06:00:00Z' },
    ],
    spotWarnings: {
      guincho: [{ areaCode: 'LSB', type: 'Agitação Marítima', level: 'yellow', endTime: '2026-10-16T18:00:00Z' }],
      matosinhos: [{ areaCode: 'PTO', type: 'Vento', level: 'yellow', endTime: '2026-10-16T06:00:00Z' }],
    },
  };

  it('mantém só os avisos ainda válidos, conserva fetchedAt e marca stale', () => {
    const r = restorePreviousWarnings(prev, { now, reason: 'x' });
    expect(r.warnings.map((w) => w.areaCode)).toEqual(['LSB']);
    expect(Object.keys(r.spotWarnings)).toEqual(['guincho']);
    expect(r.fetchedAt).toBe('2026-10-16T09:00:00Z'); // o TTL de 6 h do validador continua a contar
    expect(r).toMatchObject({ stale: true, staleSince: now.toISOString(), staleReason: 'x', source: 'ipma' });
  });

  it('um anterior já stale mantém o staleSince original', () => {
    const r = restorePreviousWarnings({ ...prev, stale: true, staleSince: '2026-10-16T10:00:00Z' }, { now, reason: 'y' });
    expect(r.staleSince).toBe('2026-10-16T10:00:00Z');
  });

  it('sem anterior utilizável → null', () => {
    expect(restorePreviousWarnings(null, { now, reason: 'x' })).toBeNull();
    expect(restorePreviousWarnings({ source: 'ipma' }, { now, reason: 'x' })).toBeNull();
  });
});

describe('verify-meteoalarm-warnings CLI (comportamental)', () => {
  const script = path.join(__dirname, '..', '..', 'verify-meteoalarm-warnings.js');
  const run = (current, previous) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmw-'));
    const out = path.join(dir, 'warnings.json');
    const prevPath = path.join(dir, 'prev.json');
    fs.writeFileSync(out, typeof current === 'string' ? current : JSON.stringify(current));
    if (previous) fs.writeFileSync(prevPath, JSON.stringify(previous));
    const stdout = execFileSync(process.execPath, [script], {
      env: { ...process.env, IPMA_WARNINGS_OUTPUT_PATH: out, IPMA_WARNINGS_PREVIOUS_PATH: prevPath },
      encoding: 'utf8',
    }); // lança se exit ≠ 0
    return { stdout, data: JSON.parse(fs.readFileSync(out, 'utf8')) };
  };
  const prev = {
    source: 'ipma',
    fetchedAt: '2026-10-16T09:00:00Z',
    warnings: [{ areaCode: 'LSB', type: 'Agitação Marítima', level: 'yellow', endTime: '2999-01-01T00:00:00Z' }],
    spotWarnings: { guincho: [{ areaCode: 'LSB', type: 'Agitação Marítima', level: 'yellow', endTime: '2999-01-01T00:00:00Z' }] },
  };

  it('meteoalarm vazio → repõe o anterior stale, ::warning::, exit 0', () => {
    const { stdout, data } = run({ source: 'meteoalarm', fetchedAt: '2026-10-16T12:00:00Z', warnings: [], spotWarnings: {} }, prev);
    expect(stdout).toMatch(/::warning::/);
    expect(stdout).not.toMatch(/::error::/);
    expect(data.stale).toBe(true);
    expect(data.source).toBe('ipma');
    expect(data.warnings).toHaveLength(1);
  });

  it('ficheiro ilegível → repõe o anterior, exit 0', () => {
    const { data } = run('{nope', prev);
    expect(data.stale).toBe(true);
    expect(data.spotWarnings.guincho).toHaveLength(1);
  });

  it('camada OK → ficheiro intacto, sem stale', () => {
    const cur = { source: 'ipma', fetchedAt: '2026-10-16T12:00:00Z', warnings: [], spotWarnings: {} };
    const { stdout, data } = run(cur, prev);
    expect(stdout).not.toMatch(/::warning::/);
    expect(data).toEqual(cur);
  });
});
