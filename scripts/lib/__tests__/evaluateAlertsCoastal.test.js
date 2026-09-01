/**
 * evaluate-alerts.js — resumo costeiro do digest do Telegram.
 *
 * Requer scripts/evaluate-alerts.js (guard require.main → sem Supabase/rede)
 * e valida o helper puro buildCoastalDigestSummary: agrega refs distintos dos
 * avisos costeiros em vigor nos spots a disparar, em pt/en, vazio sem avisos.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildCoastalDigestSummary } = require('../../evaluate-alerts.js');

function firingSpot(coastalWarn = []) {
  return { slug: 'nazare', score: 82, source: 'previsão', seaWarn: null, coastalWarn };
}

describe('buildCoastalDigestSummary', () => {
  it('agrega refs distintos em pt', () => {
    const firing = [
      firingSpot([{ id: 1, ref: 'ANAV NR 1670/26' }, { id: 2, ref: 'ANAV NR 1686/26' }]),
      firingSpot([{ id: 1, ref: 'ANAV NR 1670/26' }]), // repetida → dedupe
    ];
    const s = buildCoastalDigestSummary(firing, true);
    expect(s).toBe('⚓ Avisos à navegação costeiros (IH) em vigor na tua zona: ANAV NR 1670/26 · ANAV NR 1686/26');
  });

  it('agrega refs distintos em en (mesma dedupe)', () => {
    const firing = [
      firingSpot([{ id: 1, ref: 'ANAV NR 1670/26' }]),
      firingSpot([{ id: 1, ref: 'ANAV NR 1670/26' }, { id: 9, ref: 'ANAV NR 9000/26' }]),
    ];
    const s = buildCoastalDigestSummary(firing, false);
    expect(s).toBe('⚓ Coastal navigation warnings (IH) in force in your area: ANAV NR 1670/26 · ANAV NR 9000/26');
  });

  it('cai para AVISO <id> quando falta o ref', () => {
    const s = buildCoastalDigestSummary([firingSpot([{ id: 42 }])], true);
    expect(s).toContain('AVISO 42');
  });

  it('devolve vazio sem avisos costeiros (ou firing vazio)', () => {
    expect(buildCoastalDigestSummary([firingSpot([])], true)).toBe('');
    expect(buildCoastalDigestSummary([], true)).toBe('');
    expect(buildCoastalDigestSummary(null, true)).toBe('');
  });
});