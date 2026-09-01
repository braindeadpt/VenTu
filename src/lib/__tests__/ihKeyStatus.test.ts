import { describe, it, expect } from 'vitest';
import { deriveIhKeyStatus, deriveWmoNazareCoverage } from '../ihKeyStatus';
import type { IhBuoysHealthFile } from '../ihKeyStatus';

const STATIONS = {
  '4': { name: 'CSA92/D', latest: { date: '2026-08-14T13:00:00Z' } },
  '19': { name: 'CSA83/1D', latest: { date: '2026-08-14T13:56:45Z' } },
};

const file = (overrides: Partial<IhBuoysHealthFile> = {}): IhBuoysHealthFile => ({
  fetchedAt: '2026-08-14T14:00:00Z',
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: STATIONS,
  ...overrides,
});

describe('deriveIhKeyStatus', () => {
  it('activa quando a key está configurada e há leituras', () => {
    const s = deriveIhKeyStatus(file());
    expect(s.status).toBe('active');
    expect(s.apiKeyConfigured).toBe(true);
    expect(s.hasWaveData).toBe(true);
    expect(s.buoyCount).toBe(2);
    expect(s.newestReadingAt).toBe('2026-08-14T13:56:45Z');
    expect(s.rejectedStatus).toBeUndefined();
  });

  it('não configurada sem ficheiro ou com apiKeyConfigured:false', () => {
    expect(deriveIhKeyStatus(null).status).toBe('not-configured');
    expect(deriveIhKeyStatus(undefined).status).toBe('not-configured');
    const s = deriveIhKeyStatus(file({ apiKeyConfigured: false, hasWaveData: false }));
    expect(s.status).toBe('not-configured');
    expect(s.buoyCount).toBe(2);
  });

  it('rejeitada (apiKeyStatus unauthorized) tem precedência sobre down', () => {
    const s = deriveIhKeyStatus(
      file({
        apiKeyStatus: 'unauthorized',
        hasWaveData: false,
        authError: { status: 401, at: '2026-08-14T15:00:00Z' },
      }),
    );
    expect(s.status).toBe('rejected');
    expect(s.rejectedStatus).toBe(401);
    expect(s.rejectedAt).toBe('2026-08-14T15:00:00Z');
  });

  it('rejeitada sem authError preserva o ficheiro de forma segura', () => {
    const s = deriveIhKeyStatus(file({ apiKeyStatus: 'unauthorized', hasWaveData: false }));
    expect(s.status).toBe('rejected');
    expect(s.rejectedStatus).toBeUndefined();
    expect(s.rejectedAt).toBeUndefined();
  });

  it('down quando a key está configurada mas sem leituras (outage ≠ key)', () => {
    const s = deriveIhKeyStatus(file({ hasWaveData: false, apiKeyStatus: undefined }));
    expect(s.status).toBe('down');
    expect(s.apiKeyConfigured).toBe(true);
  });

  it('contagem de boias tolera estações ausentes', () => {
    const s = deriveIhKeyStatus(file({ stations: undefined }));
    expect(s.status).toBe('active');
    expect(s.buoyCount).toBe(0);
  });
});

describe('deriveWmoNazareCoverage (sub-estado keyless WMO/Copernicus)', () => {
  const NOW = Date.parse('2026-08-14T14:00:00Z');
  const latest = (date?: string, hs?: number) =>
    date ? { latest: { date, ...(hs != null ? { hs } : {}) } } : {};
  const wmo = (date?: string, hs?: number) => ({
    buoys: {
      '6200199': latest(date, hs),
    },
  });

  it('fresca dentro da janela WMO (≤ 6h) → fresh com leitura e altura', () => {
    const c = deriveWmoNazareCoverage(wmo('2026-08-14T10:00:00Z', 1.4648), NOW);
    expect(c.fresh).toBe(true);
    expect(c.readingAt).toBe('2026-08-14T10:00:00Z');
    expect(c.waveHeightM).toBe(1.5);
  });

  it('fora da janela (> 6h) → fria (a camada keyless não cobre agora)', () => {
    const c = deriveWmoNazareCoverage(wmo('2026-08-14T02:00:00Z'), NOW);
    expect(c.fresh).toBe(false);
    expect(c.readingAt).toBe('2026-08-14T02:00:00Z');
  });

  it('sem leitura ou sem a boia → fresh false, sem altura', () => {
    expect(deriveWmoNazareCoverage(null, NOW).fresh).toBe(false);
    expect(deriveWmoNazareCoverage({ buoys: {} }, NOW).fresh).toBe(false);
    expect(deriveWmoNazareCoverage(wmo(undefined), NOW)).toEqual({ fresh: false });
  });
});
