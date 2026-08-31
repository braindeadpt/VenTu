import { describe, expect, it } from 'vitest';
import {
  observedWaveLabel,
  observedWaveDisclaimer,
  isObservedWaveFresh,
  OBSERVED_WAVE_MAX_AGE_HOURS,
  verifyWave,
  waveVerificationBadge,
  type ObservedWave,
} from '@/lib/observedWave';

const wave: ObservedWave = {
  waveHeight: 1.8,
  wavePeriod: 11,
  waveDirection: 250,
  maxWaveHeight: 2.6,
  waterTemp: 19.1,
  stationName: 'CSA83/1D',
  stationArea: 'Sines',
  distanceKm: 40.2,
  observedAt: '2026-08-14T12:30:00Z',
  source: 'ih-buoy',
};

describe('observedWaveLabel', () => {
  it('rótulo honesto pt: boia + nome + distância arredondada', () => {
    expect(observedWaveLabel(wave, 'pt')).toBe('boia CSA83/1D a 40 km');
  });

  it('rótulo en: buoy + name + distance', () => {
    expect(observedWaveLabel(wave, 'en')).toBe('buoy CSA83/1D, 40 km away');
  });

  it('cai para a área quando falta o nome da estação', () => {
    const w = { ...wave, stationName: '' };
    expect(observedWaveLabel(w, 'pt')).toBe('boia Sines a 40 km');
  });

  it('arredonda a distância', () => {
    const w = { ...wave, distanceKm: 59.6 };
    expect(observedWaveLabel(w, 'pt')).toBe('boia CSA83/1D a 60 km');
  });
});

describe('verifyWave', () => {
  it('match dentro de 0.3 m', () => {
    const v = verifyWave(1.5, 1.8);
    expect(v.agreement).toBe('match');
    expect(v.deltaM).toBe(0.3);
    expect(v.observedM).toBe(1.8);
  });

  it('near até 0.7 m', () => {
    expect(verifyWave(1.0, 1.6).agreement).toBe('near');
    expect(verifyWave(1.0, 1.6).deltaM).toBe(0.6);
  });

  it('off acima de 0.7 m (delta negativo incluído)', () => {
    expect(verifyWave(2.5, 1.6).agreement).toBe('off');
    expect(verifyWave(2.5, 1.6).deltaM).toBe(-0.9);
  });

  it('arredonda a 1 casa decimal', () => {
    expect(verifyWave(1.24, 1.8).deltaM).toBe(0.6);
  });
});

describe('waveVerificationBadge', () => {
  it('rótulos pt/en por acordo', () => {
    expect(waveVerificationBadge('match', 'pt').label).toBe('Converge');
    expect(waveVerificationBadge('near', 'en').label).toBe('Near');
    expect(waveVerificationBadge('off', 'pt').label).toBe('Diverge');
  });

  it('símbolos estáveis', () => {
    expect(waveVerificationBadge('match', 'pt').symbol).toBe('✓');
    expect(waveVerificationBadge('off', 'pt').symbol).toBe('⚠');
  });
});

describe('observedWaveDisclaimer', () => {
  it('explica que é medido ao largo e pode diferir do line-up', () => {
    expect(observedWaveDisclaimer('pt')).toContain('IH');
    expect(observedWaveDisclaimer('pt')).toContain('ao largo');
    expect(observedWaveDisclaimer('en')).toContain('offshore');
  });

  it('identifica a rota WMO/Copernicus no fallback', () => {
    expect(observedWaveDisclaimer('pt', 'wmo-buoy')).toContain('WMO');
    expect(observedWaveDisclaimer('pt', 'wmo-buoy')).not.toContain('IH');
    expect(observedWaveDisclaimer('en', 'wmo-buoy')).toContain('Copernicus');
  });
});

describe('isObservedWaveFresh', () => {
  const NOW = Date.UTC(2026, 7, 14, 18, 0, 0);

  it('IH: gate de 3h; WMO: gate de 6h (lag de ingestão da Copernicus)', () => {
    expect(OBSERVED_WAVE_MAX_AGE_HOURS['ih-buoy']).toBe(3);
    expect(OBSERVED_WAVE_MAX_AGE_HOURS['wmo-buoy']).toBe(6);
    const ih3h = { source: 'ih-buoy' as const, observedAt: '2026-08-14T15:00:00Z' };
    const wmo5h = { source: 'wmo-buoy' as const, observedAt: '2026-08-14T13:00:00Z' };
    const wmo7h = { source: 'wmo-buoy' as const, observedAt: '2026-08-14T11:00:00Z' };
    expect(isObservedWaveFresh(ih3h, NOW)).toBe(true); // 3h exactas
    expect(isObservedWaveFresh({ ...ih3h, observedAt: '2026-08-14T14:59:59Z' }, NOW)).toBe(false);
    expect(isObservedWaveFresh(wmo5h, NOW)).toBe(true); // 5h ok no WMO
    expect(isObservedWaveFresh(wmo7h, NOW)).toBe(false);
    expect(isObservedWaveFresh({ ...wmo5h, observedAt: '2026-08-14T18:30:00Z' }, NOW)).toBe(false); // futura
  });
});
