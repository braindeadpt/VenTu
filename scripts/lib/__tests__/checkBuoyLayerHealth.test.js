/**
 * Unit tests for scripts/check-buoy-layer-health.js — o health-check do
 * workflow que avisa/falha quando a camada de boias fica down/stale por
 * várias runs seguidas (lê buoyLayer.streak do pipeline-meta.json).
 *
 * Cobre a função pura evaluateBuoyLayerHealth (ok / warn / fail por limiar) —
 * o exit 1 do CLI é derivado directamente dela.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  evaluateBuoyLayerHealth,
  DEFAULT_WARN_AFTER,
  DEFAULT_FAIL_AFTER,
} = require('../../check-buoy-layer-health.js');

const meta = (streak, status = 'down') => ({
  buoyLayer: { status, streak, lastOkAt: '2026-08-14T00:00:00Z', newestReadingAt: '2026-08-14T03:00:00Z' },
});

describe('evaluateBuoyLayerHealth', () => {
  it('streak 0 → ok (camada ok ou no-key)', () => {
    const r = evaluateBuoyLayerHealth(meta(0, 'ok'));
    expect(r.level).toBe('ok');
    expect(r.streak).toBe(0);
    expect(r.lines.join('\n')).toContain('streak down/stale: 0');
  });

  it('streak abaixo do limiar de aviso → ok', () => {
    const r = evaluateBuoyLayerHealth(meta(2), { warnAfter: 3, failAfter: 6 });
    expect(r.level).toBe('ok');
  });

  it('streak ≥ warnAfter → warn (continua, exit 0 no CLI)', () => {
    const r = evaluateBuoyLayerHealth(meta(3), { warnAfter: 3, failAfter: 6 });
    expect(r.level).toBe('warn');
    expect(r.lines.join('\n')).toContain('3 runs seguidas');
    expect(r.lines.join('\n')).toContain('falha automática a partir de 6');
  });

  it('streak ≥ failAfter → fail (job falha)', () => {
    const r = evaluateBuoyLayerHealth(meta(6), { warnAfter: 3, failAfter: 6 });
    expect(r.level).toBe('fail');
    expect(r.lines.join('\n')).toContain('6 runs seguidas');
  });

  it('meta sem buoyLayer / sem streak → streak 0 (nunca rebenta)', () => {
    expect(evaluateBuoyLayerHealth(null).level).toBe('ok');
    expect(evaluateBuoyLayerHealth({}).level).toBe('ok');
    expect(evaluateBuoyLayerHealth(undefined).level).toBe('ok');
  });

  it('streak ilegível (não numérico) → 0', () => {
    expect(evaluateBuoyLayerHealth({ buoyLayer: { status: 'down', streak: 'x' } }).streak).toBe(0);
  });

  it('defaults: aviso às 3 runs, falha às 6', () => {
    expect(DEFAULT_WARN_AFTER).toBe(3);
    expect(DEFAULT_FAIL_AFTER).toBe(6);
  });

  // ── Passo Fugro (Costa de Prata) ─────────────────────────────────────────
  it('fugro rejected com status global ok → warn logo na 1ª run (Costa de Prata sem IH)', () => {
    const r = evaluateBuoyLayerHealth({
      buoyLayer: {
        status: 'ok',
        streak: 0,
        fugro: { status: 'rejected', name: 'CSA88/2' },
        fugroRejectedStreak: 1,
      },
    });
    expect(r.level).toBe('warn');
    expect(r.lines.join('\n')).toContain('Costa de Prata sem observedWave IH');
    expect(r.lines.join('\n')).toContain('Copernicus WMO 6200199');
  });

  it('fugro rejected acumulado atinge FAIL_AFTER → fail', () => {
    const r = evaluateBuoyLayerHealth({
      buoyLayer: {
        status: 'ok',
        streak: 0,
        fugro: { status: 'rejected', name: 'CSA88/2' },
        fugroRejectedStreak: 6,
      },
    }, { warnAfter: 3, failAfter: 6 });
    expect(r.level).toBe('fail');
    expect(r.lines.join('\n')).toContain('família Fugro');
  });

  it('fugro ok/no-key não acrescenta aviso (linhas normais)', () => {
    const ok = evaluateBuoyLayerHealth({
      buoyLayer: { status: 'ok', streak: 0, fugro: { status: 'ok' }, fugroRejectedStreak: 0 },
    });
    expect(ok.level).toBe('ok');
    expect(ok.lines.join('\n')).not.toContain('Costa de Prata');
  });

  it('fugro ausente do meta (sem sub-estado) → comportamento actual', () => {
    const r = evaluateBuoyLayerHealth(meta(0, 'ok'));
    expect(r.level).toBe('ok');
    expect(r.lines.join('\n')).not.toContain('Fugro');
  });
});
