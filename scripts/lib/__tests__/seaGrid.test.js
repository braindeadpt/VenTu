/**
 * Testes das partes puras do build-sea-grid.js (grelha de vento + ondulação).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sg = require('../seaGrid.js');

describe('seaGrid — grelha e quantização', () => {
  it('caixas: fundo atlântico a 1° + três caixas costeiras a 0,5°, na mesma malha', () => {
    const { boxes, nodes } = sg.buildNodes();
    expect(boxes.map((b) => [b.id, b.step])).toEqual([
      ['mainland', 0.5],
      ['azores', 0.5],
      ['madeira', 0.5],
      ['atlantic', 1],
    ]);
    expect(nodes.length).toBe(boxes.reduce((n, b) => n + b.nx * b.ny, 0));
    const atl = boxes[3];
    // domínio da maquete: 26,5–46,5 N × 34,5–0,5 W
    expect(atl.west).toBe(-34.5);
    expect(atl.south).toBe(26.5);
    expect(atl.west + (atl.nx - 1) * atl.step).toBe(-0.5);
    expect(atl.south + (atl.ny - 1) * atl.step).toBe(46.5);
    // todos os nós caem na malha de 0,5° (nós coincidentes partilham o pedido)
    for (const n of nodes) {
      expect(Math.abs(n.lat * 2 - Math.round(n.lat * 2))).toBeLessThan(1e-9);
      expect(Math.abs(n.lon * 2 - Math.round(n.lon * 2))).toBeLessThan(1e-9);
    }
  });

  it('selecção de nós pela máscara de terra: terra funda fora, finas só na costa', () => {
    const { nodes } = sg.buildNodes();
    const at = (lat, lon, box) => nodes.find((n, k) => n.lat === lat && n.lon === lon && (!box || k >= box));
    // Madrid (terra funda) — nem a fina nem a grossa pedem
    expect(nodes.filter((n) => n.lat === 40.5 && n.lon === -3.5).every((n) => !n.fetch)).toBe(true);
    // mar ao largo de Peniche (costa) — pedido
    expect(at(39.5, -9.5).fetch).toBe(true);
    // costa cantábrica e golfo de Cádis entram na caixa fina
    expect(at(43.5, -6.0).fetch).toBe(true);
    expect(at(36.5, -6.5).fetch).toBe(true);
    // mar aberto na caixa fina (longe da costa) — fica para o fundo de 1°
    expect(at(36.5, -11.5).fetch).toBe(false);
    // ... e o fundo pede-o
    expect(nodes.filter((n) => n.lat === 36.5 && n.lon === -11.5).some((n) => n.fetch)).toBe(true);
    // sem máscara: heurística v1
    const legacy = sg.buildNodes(sg.BOXES, null);
    expect(legacy.nodes.find((n) => n.lat === 40.5 && n.lon === -7).fetch).toBe(false);
  });

  it('quota: localizações únicas por API e por corrida cabem no orçamento', () => {
    const { nodes } = sg.buildNodes();
    const unique = sg.uniqueFetchKeys(nodes).size;
    // nós coincidentes (0,5° ∩ 1°) contam uma vez
    expect(unique).toBeLessThan(nodes.filter((n) => n.fetch).length);
    // 2 APIs × ≤ 900 localizações ≤ 1 800 chamadas por corrida
    expect(unique).toBeLessThanOrEqual(900);
    expect(sg.SEA_GRID_MIN_AGE_HOURS).toBeGreaterThanOrEqual(11.5);
  });

  it('guarda da quota: gasto de hoje + resto do pipeline (pior caso) + grelha ≤ 9 000', () => {
    // dia inteiro pela frente (00:00 UTC): as 11 corridas full do verão = 8 326
    const midnight = Date.UTC(2026, 9, 8, 0, 0);
    expect(sg.projectConditionsCalls(midnight)).toBe(8326);
    // às 22:20 UTC só falta a corrida das 00 h de Lisboa (23:17 UTC)
    expect(sg.projectConditionsCalls(Date.UTC(2026, 9, 8, 22, 20))).toBe(362);
    const noon = Date.UTC(2026, 9, 8, 11, 20);
    const day = (used) => ({ openMeteoUsage: { dayUtc: '2026-10-08', dailyWeightedCalls: used, spotsFetched: 181 } });
    // dia real típico (medido: ~1–2,5k ao meio-dia) → corre
    const ok = sg.seaGridQuotaCheck(day(2475), 1680, noon);
    expect(ok).toMatchObject({ ok: true, usedToday: 2475, cost: 1680 });
    expect(ok.projected).toBe(2475 + ok.rest + 1680);
    // dia no pior caso teórico (todas as âncoras multi-modelo) → salta
    expect(sg.seaGridQuotaCheck(day(4706), 1680, noon).ok).toBe(false);
    // contador de ontem não conta
    const stale = { openMeteoUsage: { dayUtc: '2026-10-07', dailyWeightedCalls: 9000 } };
    expect(sg.seaGridQuotaCheck(stale, 1680, noon).usedToday).toBe(0);
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

  it('encodeSeaGrid v2: só os nós com `store` entram; máscara por caixa', () => {
    const boxes = [
      { id: 'f', west: 0, south: 0, nx: 2, ny: 2, step: 0.5, first: 0 },
      { id: 'c', west: 0, south: 0, nx: 2, ny: 2, step: 1, first: 4 },
    ];
    const nodes = [
      { lat: 0, lon: 0, fetch: true, store: true },
      { lat: 0, lon: 0.5, fetch: false, store: false },
      { lat: 0.5, lon: 0, fetch: false, store: false },
      { lat: 0.5, lon: 0.5, fetch: true, store: true },
      ...[0, 1, 2, 3].map(() => ({ lat: 0, lon: 0, fetch: true, store: true })),
    ];
    const w = { wind_speed_10m: [5], wind_direction_10m: [0] };
    const f = sg.encodeSeaGrid({
      boxes, nodes, wind: nodes.map((n) => (n.fetch ? w : null)), marine: nodes.map(() => null),
      times: [100], idx: [0], generatedAt: 'g', source: 's',
    });
    expect(f.v).toBe(2);
    expect(f.n).toBe(6);
    expect(f.step).toBe(0.5);
    expect(f.boxes[0]).toMatchObject({ id: 'f', step: 0.5, offset: 0, count: 2 });
    expect([...Buffer.from(f.boxes[0].mask, 'base64')]).toEqual([0b1001]);
    expect(f.boxes[1]).toMatchObject({ id: 'c', step: 1, offset: 2, count: 4 });
    expect(f.boxes[1].mask).toBeUndefined();
    expect(Buffer.from(f.fields.u, 'base64').length).toBe(6);
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
    expect(f).toMatchObject({ v: 2, t0: 100, nt: 2, n: 2, stepHours: 1, nodata: 255 });
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

  it('frescura (11,5 h, só v2) e soma ao contador diário da quota', () => {
    const now = Date.UTC(2026, 9, 7, 12);
    expect(sg.isSeaGridFresh({ v: 2, generatedAt: new Date(now - 6 * 3600_000).toISOString() }, now)).toBe(true);
    expect(sg.isSeaGridFresh({ v: 2, generatedAt: new Date(now - 12 * 3600_000).toISOString() }, now)).toBe(false);
    // um ficheiro v1 é refeito logo (formato antigo, só 3 caixas)
    expect(sg.isSeaGridFresh({ v: 1, generatedAt: new Date(now - 3600_000).toISOString() }, now)).toBe(false);
    expect(sg.isSeaGridFresh(null, now)).toBe(false);
    const meta = { openMeteoUsage: { dayUtc: '2026-10-07', dailyWeightedCalls: 3000, weightedCalls: 363 } };
    const out = sg.bumpOpenMeteoUsage(meta, 788, now);
    expect(out.openMeteoUsage).toMatchObject({ dailyWeightedCalls: 3788, seaGridCalls: 788, weightedCalls: 363 });
    const next = sg.bumpOpenMeteoUsage(meta, 788, Date.UTC(2026, 9, 8, 1));
    expect(next.openMeteoUsage.dailyWeightedCalls).toBe(788);
  });
});
