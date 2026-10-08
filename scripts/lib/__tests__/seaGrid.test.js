/**
 * Testes das partes puras do build-sea-grid.js (grelha de vento + ondulação).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sg = require('../seaGrid.js');

describe('seaGrid — grelha e quantização', () => {
  it('nós das três caixas a 0,5°, com o interior da Península fora dos pedidos', () => {
    const { boxes, nodes } = sg.buildNodes();
    expect(boxes.map((b) => b.id)).toEqual(['mainland', 'azores', 'madeira']);
    expect(boxes[0]).toMatchObject({ nx: 14, ny: 17, offset: 0 });
    expect(boxes[1].offset).toBe(14 * 17);
    expect(nodes.length).toBe(boxes.reduce((n, b) => n + b.nx * b.ny, 0));
    // Madrid-ish fica fora; o mar ao largo de Peniche entra
    expect(sg.isDeepInland(40.5, -7.0)).toBe(true);
    expect(sg.isDeepInland(39.5, -9.5)).toBe(false);
    // costa cantábrica (lat > 43) e golfo de Cádis (lat < 37,75) continuam pedidos
    expect(sg.isDeepInland(43.5, -7.0)).toBe(false);
    expect(sg.isDeepInland(36.5, -6.5)).toBe(false);
    const asked = nodes.filter((n) => n.fetch).length;
    // orçamento da quota: < 400 localizações por API e por corrida
    expect(asked).toBeLessThan(400);
  });

  it('vento: m/s + direcção DE ONDE → bytes u/v do vector (para onde sopra)', () => {
    // Nortada de 10 m/s (de N, 0°) sopra para sul: u≈0, v=-10
    const [u, v] = sg.encodeWind(10, 0);
    expect((u - 128) * sg.SCALE.u).toBeCloseTo(0, 5);
    expect((v - 128) * sg.SCALE.v).toBeCloseTo(-10, 5);
    // De oeste (270°) a 4 m/s → para leste: u=+4
    const [u2] = sg.encodeWind(4, 270);
    expect((u2 - 128) * sg.SCALE.u).toBeCloseTo(4, 5);
    expect(sg.encodeWind(null, 10)).toEqual([sg.NODATA, sg.NODATA]);
    // satura em ±31,75 m/s sem colidir com o nodata
    expect(sg.encodeWind(60, 270)[0]).toBe(254);
  });

  it('Hs, período e direcção: passo, nodata e o 255 reservado', () => {
    expect(sg.encodeHs(2.34)).toBe(23);
    expect(sg.encodeHs(null)).toBe(sg.NODATA);
    expect(sg.encodeHs(40)).toBe(254);
    expect(sg.encodePer(12.06)).toBe(121);
    expect(sg.encodePer(0)).toBe(sg.NODATA);
    expect(sg.encodeDir(0)).toBe(0);
    expect(sg.encodeDir(180)).toBe(128);
    expect(sg.encodeDir(-90)).toBe(192);
    expect(sg.encodeDir(358.6)).toBe(254);
    expect(sg.encodeDir(359.9)).toBe(0);
  });

  it('pickTimeIndices parte da hora corrente', () => {
    const t0 = Date.UTC(2026, 9, 7, 0) / 1000;
    const times = Array.from({ length: 96 }, (_, k) => t0 + k * 3600);
    const now = Date.UTC(2026, 9, 7, 5, 40);
    const idx = sg.pickTimeIndices(times, now, 54);
    expect(times[idx[0]]).toBe(Date.UTC(2026, 9, 7, 5) / 1000);
    expect(idx.length).toBe(55);
  });

  it('encodeSeaGrid: layout [t][nó], swell com fallback para a onda total', () => {
    const boxes = [{ id: 'x', west: 0, south: 0, nx: 2, ny: 1, offset: 0 }];
    const nodes = [{ lat: 0, lon: 0, fetch: true }, { lat: 0, lon: 0.5, fetch: true }];
    const wind = [
      { wind_speed_10m: [5, 6], wind_direction_10m: [0, 90] },
      null,
    ];
    const marine = [
      { wave_height: [1.5, 1.6], swell_wave_direction: [300, 300], swell_wave_period: [12, 12] },
      { wave_height: [0.8, null], swell_wave_direction: [null, null], swell_wave_period: [null, null], wave_direction: [270, 270], wave_period: [6, 6] },
    ];
    const f = sg.encodeSeaGrid({ boxes, nodes, wind, marine, times: [100, 3700], idx: [0, 1], generatedAt: 'g', source: 's' });
    expect(f).toMatchObject({ v: 1, t0: 100, nt: 2, n: 2, stepHours: 1, nodata: 255 });
    const hs = Buffer.from(f.fields.hs, 'base64');
    const per = Buffer.from(f.fields.per, 'base64');
    const u = Buffer.from(f.fields.u, 'base64');
    expect([...hs]).toEqual([15, 8, 16, 255]);
    // nó 1 sem swell usa wave_period
    expect([...per]).toEqual([120, 60, 120, 255]);
    // nó 1 sem vento pedido → nodata
    expect(u[1]).toBe(255);
    expect(u[2]).toBe(128 - 24); // 6 m/s de E → u = -6 → -24 passos
  });

  it('frescura (5,5 h) e soma ao contador diário da quota', () => {
    const now = Date.UTC(2026, 9, 7, 12);
    expect(sg.isSeaGridFresh({ v: 1, generatedAt: new Date(now - 3600_000).toISOString() }, now)).toBe(true);
    expect(sg.isSeaGridFresh({ v: 1, generatedAt: new Date(now - 6 * 3600_000).toISOString() }, now)).toBe(false);
    expect(sg.isSeaGridFresh(null, now)).toBe(false);
    const meta = { openMeteoUsage: { dayUtc: '2026-10-07', dailyWeightedCalls: 3000, weightedCalls: 363 } };
    const out = sg.bumpOpenMeteoUsage(meta, 788, now);
    expect(out.openMeteoUsage).toMatchObject({ dailyWeightedCalls: 3788, seaGridCalls: 788, weightedCalls: 363 });
    const next = sg.bumpOpenMeteoUsage(meta, 788, Date.UTC(2026, 9, 8, 1));
    expect(next.openMeteoUsage.dailyWeightedCalls).toBe(788);
  });
});
