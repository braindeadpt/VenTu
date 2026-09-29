import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  MIN_BASELINE_PAIRS,
  MIN_SAME_PHASE,
  SAME_PHASE_MIN_H,
  SAME_PHASE_MAX_H,
  MAX_RESIDUALS,
  MAX_ANOMALY_M,
  MAX_RAW_RESIDUAL_M,
  SIGNIFICANT_ANOMALY_M,
  median,
  recordResidual,
  tideAnomalyM,
} = require('../tideAnomaly.js');

const NOW = Date.now();
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

describe('tideAnomaly — mediana', () => {
  it('mediana de ímpares e pares', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([2.6])).toBe(2.6);
  });

  it('vazio → null', () => {
    expect(median([])).toBeNull();
    expect(median(null)).toBeNull();
  });
});

describe('tideAnomaly — recordResidual', () => {
  it('acumula amostras [t, resíduo] e mantém mediana', () => {
    const stations = {};
    recordResidual(stations, 152, 2.6, hoursAgo(14));
    recordResidual(stations, 152, 2.7, hoursAgo(13));
    recordResidual(stations, 152, 2.5, hoursAgo(12));
    const e = stations['152'];
    expect(e.n).toBe(3);
    expect(e.median).toBe(2.6);
    expect(e.samples).toHaveLength(3);
    expect(e.samples[0][1]).toBe(2.6);
  });

  it('deduplica amostras no mesmo minuto (N spots → mesma estação)', () => {
    const stations = {};
    const t = hoursAgo(2);
    recordResidual(stations, 152, 2.6, t);
    recordResidual(stations, 152, 2.6, t);
    recordResidual(stations, 152, 2.6, t);
    expect(stations['152'].samples).toHaveLength(1);
    // Minuto diferente conta.
    recordResidual(stations, 152, 2.61, hoursAgo(1));
    expect(stations['152'].samples).toHaveLength(2);
  });

  it('limita a janela a MAX_RESIDUALS', () => {
    const stations = {};
    for (let i = 0; i < MAX_RESIDUALS + 10; i += 1) {
      recordResidual(stations, 74, 2.0 + i * 0.001, new Date(NOW - (400 - i) * 3_600_000).toISOString());
    }
    expect(stations['74'].samples).toHaveLength(MAX_RESIDUALS);
    expect(stations['74'].n).toBe(MAX_RESIDUALS);
  });

  it('rejeita resíduos implausíveis (salto de datum / leitura corrupta)', () => {
    const stations = {};
    recordResidual(stations, 9, 2.5, hoursAgo(3));
    const rejected = recordResidual(stations, 9, MAX_RAW_RESIDUAL_M + 1, hoursAgo(2));
    expect(rejected).toBeNull();
    expect(stations['9'].n).toBe(1);
    expect(recordResidual(stations, 9, NaN, hoursAgo(1))).toBeNull();
    expect(stations['9'].n).toBe(1);
  });
});

describe('tideAnomaly — tideAnomalyM (baseline por fase M2)', () => {
  // Baseline realista: resíduo cru oscila com a fase da maré (amplitude real
  // ≠ modelo). Amostras horárias ao longo de 30 h.
  const seededEntry = (offset = 2.6, amplitude = 0.5) => {
    const stations = {};
    for (let h = 30; h >= 1; h -= 1) {
      const phase = Math.sin(((30 - h) / 12.42) * Math.PI * 2);
      recordResidual(stations, 152, offset + amplitude * phase, hoursAgo(h));
    }
    return stations['152'];
  };

  const samePhaseValues = (entry) =>
    entry.samples
      .filter(([ts]) => {
        const age = (NOW - new Date(ts).getTime()) / 3_600_000;
        return age >= SAME_PHASE_MIN_H && age <= SAME_PHASE_MAX_H;
      })
      .map(([, v]) => v);

  it('anomalia = resíduo actual − mediana da mesma fase de maré', () => {
    const entry = seededEntry();
    // obsZh − predMsl = resíduo actual; a baseline de mesma fase (10–15 h
    // atrás) tem o mesmo offset+fase → anomalia ≈ 0 em regime normal.
    const samePhase = samePhaseValues(entry);
    expect(samePhase.length).toBeGreaterThanOrEqual(MIN_SAME_PHASE);
    const obs = 0.5 + median(samePhase); // pred 0.5 + resíduo da fase
    const a = tideAnomalyM({ obsZh: obs, predMsl: 0.5, entry, nowMs: NOW });
    expect(a).not.toBeNull();
    expect(Math.abs(a)).toBeLessThan(0.05);
  });

  it('ressaca: obs +0,8 m acima da fase → anomalia ≈ +0,8', () => {
    const entry = seededEntry();
    const obs = 0.5 + median(samePhaseValues(entry)) + 0.8;
    expect(tideAnomalyM({ obsZh: obs, predMsl: 0.5, entry, nowMs: NOW })).toBeCloseTo(0.8, 2);
  });

  it('omite sem cobertura de mesma fase — uma mediana global misturaria fases', () => {
    // Baseline só com amostras <10 h (sem janela M2 anterior).
    const stations = {};
    for (let h = 9; h >= 1; h -= 1) recordResidual(stations, 152, 2.6, hoursAgo(h));
    const entry = stations['152'];
    expect(entry.samples.length).toBeGreaterThanOrEqual(MIN_BASELINE_PAIRS - 1);
    expect(tideAnomalyM({ obsZh: 3.9, predMsl: 0.5, entry, nowMs: NOW })).toBeNull();
    expect(tideAnomalyM({ obsZh: 3.9, predMsl: 0.5, entry: null })).toBeNull();
    expect(tideAnomalyM({ obsZh: 3.9, predMsl: 0.5, entry: {} })).toBeNull();
  });

  it('omite anomalias implausíveis (> MAX_ANOMALY_M — lixo de sensor)', () => {
    const entry = seededEntry();
    const wild = tideAnomalyM({ obsZh: 3.0 + MAX_ANOMALY_M + 0.5, predMsl: 0.5, entry, nowMs: NOW });
    expect(wild).toBeNull();
  });

  it('omite inputs inválidos sem rebentar', () => {
    const entry = seededEntry();
    expect(tideAnomalyM({ obsZh: NaN, predMsl: 0.5, entry, nowMs: NOW })).toBeNull();
    expect(tideAnomalyM({ obsZh: 3.0, predMsl: null, entry, nowMs: NOW })).toBeNull();
    expect(tideAnomalyM({ obsZh: null, predMsl: 0.5, entry, nowMs: NOW })).toBeNull();
  });

  it('threshold de «maré meteorológica» é 0,3 m', () => {
    expect(SIGNIFICANT_ANOMALY_M).toBe(0.3);
    expect(MIN_SAME_PHASE).toBeGreaterThanOrEqual(1);
  });
});
