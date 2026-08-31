import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  ARCHIVE_WINDOW_DAYS,
  emptyArchive,
  readArchive,
  writeArchive,
  hourKey,
  mergeBuoyReadings,
  pruneArchive,
  mapSpotsToNearestBuoy,
} = require('../wmoBiasArchive.js');

describe('hourKey', () => {
  it('bucketa por hora UTC e rejeita datas inválidas', () => {
    expect(hourKey('2026-08-14T08:31:00.000Z')).toBe('2026-08-14T08');
    expect(hourKey('2026-08-14T00:00:00Z')).toBe('2026-08-14T00');
    expect(hourKey('lixo')).toBeNull();
    expect(hourKey(undefined)).toBeNull();
  });
});

describe('mergeBuoyReadings', () => {
  it('deduplica por hora UTC e fica com a leitura mais recente', () => {
    const a = emptyArchive();
    mergeBuoyReadings(
      a,
      '6200084',
      { name: 'Cabo Silleiro', area: 'Galiza', lat: 42.12, lon: -9.43 },
      [
        { date: '2026-08-14T08:00:00Z', hs: 1.2 },
        { date: '2026-08-14T08:30:00Z', hs: 1.4 }, // mesma hora, mais recente
        { date: '2026-08-14T09:00:00Z', hs: 1.5 },
      ],
    );
    expect(a.buoys['6200084'].readings).toHaveLength(2);
    const h8 = a.buoys['6200084'].readings.find((r) => r.date.startsWith('2026-08-14T08'));
    expect(h8.hm0).toBe(1.4);
    expect(a.buoys['6200084'].name).toBe('Cabo Silleiro');
    expect(a.buoys['6200084'].lat).toBe(42.12);
  });

  it('filtra leituras sem hm0 válido e devolve 0 sem readings', () => {
    const a = emptyArchive();
    expect(mergeBuoyReadings(a, '6200084', null, [])).toBe(0);
    expect(mergeBuoyReadings(a, '6200084', null, [{ date: 'lixo', hs: 1 }])).toBe(0);
    expect(mergeBuoyReadings(a, '6200084', null, [{ date: '2026-08-14T08:00:00Z', hs: -1 }])).toBe(0);
    expect(Object.keys(a.buoys)).toHaveLength(0);
  });

  it('acumula runs diferentes sem perder o histórico', () => {
    const a = emptyArchive();
    mergeBuoyReadings(a, '6200084', null, [{ date: '2026-08-13T10:00:00Z', hs: 1.1 }]);
    mergeBuoyReadings(a, '6200084', null, [{ date: '2026-08-14T10:00:00Z', hs: 1.6 }]);
    expect(a.buoys['6200084'].readings).toHaveLength(2);
  });
});

describe('pruneArchive', () => {
  const NOW = Date.UTC(2026, 7, 14, 18, 0, 0);
  it('remove leituras fora da janela (13 dias)', () => {
    const a = emptyArchive();
    mergeBuoyReadings(a, '6200084', null, [
      { date: '2026-08-14T10:00:00Z', hs: 1.6 },
      { date: '2026-07-20T10:00:00Z', hs: 1.0 }, // fora da janela
    ]);
    pruneArchive(a, NOW);
    expect(ARCHIVE_WINDOW_DAYS).toBe(13);
    expect(a.buoys['6200084'].readings).toHaveLength(1);
    expect(a.buoys['6200084'].readings[0].date).toBe('2026-08-14T10:00:00Z');
  });
});

describe('persistência', () => {
  it('read/write round-trip e devolve vazio se ausente/corrompido', () => {
    const p = path.join(os.tmpdir(), 'wmo-bias-archive-test.json');
    const a = emptyArchive();
    mergeBuoyReadings(a, '6200084', { name: 'Cabo Silleiro' }, [
      { date: '2026-08-14T10:00:00Z', hs: 1.6 },
    ]);
    writeArchive(a, p);
    const back = readArchive(p);
    expect(back.buoys['6200084'].readings).toHaveLength(1);
    fs.rmSync(p, { force: true });
    expect(readArchive(p)).toEqual(emptyArchive());
    const corrupt = path.join(os.tmpdir(), 'wmo-bias-archive-corrupt.json');
    fs.writeFileSync(corrupt, '{oops');
    expect(readArchive(corrupt)).toEqual(emptyArchive());
    fs.rmSync(corrupt, { force: true });
  });
});

describe('mapSpotsToNearestBuoy', () => {
  it('mapeia cada spot para a boia ES mais próxima dentro do raio', () => {
    const buoys = {
      '6200084': { lat: 42.12, lon: -9.43 }, // Cabo Silleiro
      '6200085': { lat: 36.49, lon: -6.96 }, // Golfo de Cádiz
    };
    const spots = [
      { id: 'moledo', lat: 41.85, lon: -8.87 }, // ~56 km de Silleiro
      { id: 'sagres', lat: 37.0, lon: -8.95 }, // muito mais perto de Cádiz
      { id: 'longe', lat: 50.0, lon: 10.0 }, // fora do raio → omitido
    ];
    const mapping = mapSpotsToNearestBuoy(spots, buoys);
    expect(mapping.moledo.idEst).toBe('6200084');
    expect(mapping.moledo.distanceKm).toBeLessThan(70);
    expect(mapping.sagres.idEst).toBe('6200085');
    expect(mapping.longe).toBeUndefined();
  });

  it('respeita maxKm e ignora boias sem posição', () => {
    const buoys = { '6200084': { lat: 42.12, lon: -9.43 } };
    const mapping = mapSpotsToNearestBuoy([{ id: 'sagres', lat: 37.0, lon: -8.95 }], buoys, 100);
    expect(mapping).toEqual({});
  });
});
