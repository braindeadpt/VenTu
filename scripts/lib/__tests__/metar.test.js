import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildMetarObservedPayload,
  buildMetarObservedForSpot,
  nearestMetarStations,
  cardinalFromDeg,
} = require('../metar.js');

describe('cardinalFromDeg', () => {
  it('maps degrees to 8-point cardinal', () => {
    expect(cardinalFromDeg(0)).toBe('N');
    expect(cardinalFromDeg(90)).toBe('E');
    expect(cardinalFromDeg(225)).toBe('SW');
  });
});

describe('nearestMetarStations', () => {
  it('finds Lisboa METAR near Caparica', () => {
    const near = nearestMetarStations(38.64, -9.24);
    expect(near.length).toBeGreaterThan(0);
    expect(near[0].icao).toMatch(/^LP/);
    expect(near[0].distanceKm).toBeLessThanOrEqual(30);
  });
});

describe('buildMetarObservedPayload', () => {
  it('builds fresh observed payload from METAR row', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = buildMetarObservedPayload(
      { wspd: 14, wdir: 315, obsTime: nowSec, temp: 22 },
      { icao: 'LPPT', name: 'Lisboa (METAR)', distanceKm: 18 },
    );
    expect(payload?.source).toBe('metar');
    expect(payload?.windSpeedKt).toBe(14);
    expect(payload?.windDirDeg).toBe(315);
    expect(payload?.metarIcao).toBe('LPPT');
  });

  it('rejects stale METAR', () => {
    const oldSec = Math.floor(Date.now() / 1000) - 5 * 3600;
    expect(
      buildMetarObservedPayload(
        { wspd: 14, wdir: 270, obsTime: oldSec },
        { icao: 'LPPT', name: 'Lisboa (METAR)', distanceKm: 10 },
      ),
    ).toBeNull();
  });
});

describe('buildMetarObservedForSpot', () => {
  it('picks nearest airport with data', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const byIcao = {
      LPPT: { icaoId: 'LPPT', wspd: 12, wdir: 280, obsTime: nowSec },
      LPMT: { icaoId: 'LPMT', wspd: 10, wdir: 270, obsTime: nowSec },
    };
    const out = buildMetarObservedForSpot({ lat: 38.64, lon: -9.24 }, byIcao);
    expect(out?.source).toBe('metar');
    expect(out?.windSpeedKt).toBeGreaterThan(0);
  });

  it('reaches Seixal Madeira with island 35 km radius', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const byIcao = {
      LPMA: { icaoId: 'LPMA', wspd: 10, wdir: 20, obsTime: nowSec },
    };
    // Seixal ~33.7 km from LPMA
    const out = buildMetarObservedForSpot(
      { lat: 32.825, lon: -17.108 },
      byIcao,
    );
    expect(out?.source).toBe('metar');
    expect(out?.metarIcao).toBe('LPMA');
    expect(out?.distanceKm).toBeGreaterThan(30);
    expect(out?.distanceKm).toBeLessThanOrEqual(35);
  });
});
