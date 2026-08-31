import { describe, expect, it } from 'vitest';
import { fmtAgeHours, fmtDistanceKm } from '../ObservedWaveSourcesChip';
import { waveCalibrationTag } from '@/lib/observedWave';

describe('fmtAgeHours (chip compacto IH vs WMO)', () => {
  it('formata horas sem zeros à direita', () => {
    expect(fmtAgeHours(1)).toBe('1h');
    expect(fmtAgeHours(1.0)).toBe('1h');
    expect(fmtAgeHours(5.2)).toBe('5.2h');
    expect(fmtAgeHours(0.3)).toBe('0.3h');
    expect(fmtAgeHours(12)).toBe('12h');
  });

  it('devolve n/d para valores inválidos ou negativos', () => {
    expect(fmtAgeHours(null)).toBe('n/d');
    expect(fmtAgeHours(undefined)).toBe('n/d');
    expect(fmtAgeHours(Number.NaN)).toBe('n/d');
    expect(fmtAgeHours(-1)).toBe('n/d');
  });
});

describe('fmtDistanceKm (chip compacto IH vs WMO)', () => {
  it('arredonda para km inteiros', () => {
    expect(fmtDistanceKm(56.4)).toBe('56 km');
    expect(fmtDistanceKm(60)).toBe('60 km');
  });

  it('devolve null sem distância', () => {
    expect(fmtDistanceKm(null)).toBeNull();
    expect(fmtDistanceKm(undefined)).toBeNull();
    expect(fmtDistanceKm(Number.NaN)).toBeNull();
    expect(fmtDistanceKm(-3)).toBeNull();
  });
});

describe('waveCalibrationTag (chip compacto cross-border)', () => {
  it('devolve null sem calibração', () => {
    expect(waveCalibrationTag(null, 'pt')).toBeNull();
    expect(waveCalibrationTag({} as never, 'pt')).toBeNull();
    expect(waveCalibrationTag({ calibration: undefined } as never, 'pt')).toBeNull();
  });

  it('formata o rótulo PT com ME e n', () => {
    const tag = waveCalibrationTag(
      {
        waveHeight: 2.4,
        calibration: { me: -0.9, n: 27, from: 'Cabo Silleiro × Faro', rawHeight: 3.3, deltaM: -0.9 },
      } as never,
      'pt',
    );
    expect(tag).not.toBeNull();
    expect(tag!.label).toBe('🔧 ref. PT (-0.9 m · n=27)');
    expect(tag!.title).toContain('ME -0.9 m (n=27)');
    expect(tag!.title).toContain('3.3 m');
    expect(tag!.title).toContain('2.4 m');
  });

  it('usa o rótulo ES×PT genérico quando falta o par e sinal positivo no ME', () => {
    const tag = waveCalibrationTag(
      { calibration: { me: 0.4, n: 5, rawHeight: 1.6, deltaM: 0.4 } } as never,
      'en',
    );
    expect(tag).not.toBeNull();
    expect(tag!.label).toBe('🔧 PT ref (+0.4 m · n=5)');
    expect(tag!.title).toContain('ME +0.4 m (n=5)');
    expect(tag!.title).toContain('height = 1.6 m');
  });

  it('devolve null para ME/n não finitos', () => {
    expect(
      waveCalibrationTag({ calibration: { me: Number.NaN, n: 27 } } as never, 'pt'),
    ).toBeNull();
  });
});
