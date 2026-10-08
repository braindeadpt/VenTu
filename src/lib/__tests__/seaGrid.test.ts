import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import {
  SEA_DOMAIN,
  SEA_DOMAIN_VIEW_BOUNDS,
  applyFillPlan,
  buildFillPlan,
  SEA_GRID_BLEND_CELLS,
  dilateSwell,
  lisbonLocalToEpochMs,
  parseSeaGrid,
  sampleSeaGrid,
  seaGridBoxAt,
  seaGridExtent,
  seaGridFrame,
  seaGridTimeIndex,
} from '../seaGrid';

const require = createRequire(import.meta.url);
const enc = require('../../../scripts/lib/seaGrid.js');

/** Grelha sintética 3×2 nós, 2 horas, codificada pelo MESMO encoder do pipeline. */
function synthetic() {
  const boxes = [{ id: 'b', west: -10, south: 38, nx: 3, ny: 2, offset: 0 }];
  const nodes = [
    { lat: 38, lon: -10 }, { lat: 38, lon: -9.5 }, { lat: 38, lon: -9 },
    { lat: 38.5, lon: -10 }, { lat: 38.5, lon: -9.5 }, { lat: 38.5, lon: -9 },
  ].map((n) => ({ ...n, fetch: true }));
  // vento de N a 10 m/s em t0, 20 m/s em t1
  const wind = nodes.map(() => ({ wind_speed_10m: [10, 20], wind_direction_10m: [0, 0] }));
  // Hs 1 m a oeste, 2 m no meio, terra (null) a leste; swell de NW (315°), 12 s
  const hsCol = [1, 2, null];
  const marine = nodes.map((_, k) => {
    const h = hsCol[k % 3];
    return {
      wave_height: [h, h == null ? null : h + 1],
      swell_wave_direction: [315, 315],
      swell_wave_period: [12, 14],
    };
  });
  const raw = enc.encodeSeaGrid({
    boxes, nodes, wind, marine, times: [1_800_000_000, 1_800_003_600], idx: [0, 1],
    generatedAt: '2027-01-15T08:00:00.000Z', source: 'test',
  });
  return JSON.parse(JSON.stringify(raw));
}

/** O mesmo ficheiro no formato v1 (um `step` global, caixas sem `step`/`count`). */
function syntheticV1() {
  const raw = synthetic();
  raw.v = 1;
  for (const b of raw.boxes) {
    delete b.step;
    delete b.count;
  }
  return raw;
}

describe('parseSeaGrid', () => {
  it('descodifica bytes → unidades físicas e rejeita formas erradas', () => {
    const g = parseSeaGrid(synthetic())!;
    expect(g).not.toBeNull();
    expect(g.n).toBe(6);
    expect(g.nt).toBe(2);
    // vento de N → para sul
    expect(g.u[0]).toBeCloseTo(0, 5);
    expect(g.v[0]).toBeCloseTo(-10, 5);
    expect(g.hs[0]).toBeCloseTo(1, 5);
    expect(g.per[0]).toBeCloseTo(12, 5);
    // de NW (315°) → propaga para SE: e>0, n<0
    expect(g.pe[0]).toBeGreaterThan(0.69);
    expect(g.pn[0]).toBeLessThan(-0.69);
    expect(parseSeaGrid(null)).toBeNull();
    expect(parseSeaGrid({ ...synthetic(), v: 4 })).toBeNull();
    const bad = synthetic();
    bad.fields.hs = bad.fields.hs.slice(0, 4);
    expect(parseSeaGrid(bad)).toBeNull();
    const badBox = synthetic();
    badBox.boxes[0].offset = 3;
    expect(parseSeaGrid(badBox)).toBeNull();
  });

  it('prolonga a ondulação um anel para terra/costa (dilatação)', () => {
    const g = parseSeaGrid(synthetic())!;
    // coluna leste era null — fica com a média dos vizinhos de mar (2 m)
    expect(g.hs[2]).toBeCloseTo(2, 5);
    expect(g.hs[5]).toBeCloseTo(2, 5);
    // dilatar de novo não mexe em nós já válidos
    const hs = new Float32Array([NaN, NaN, 1, NaN]);
    const per = new Float32Array([NaN, NaN, 10, NaN]);
    const pe = new Float32Array([NaN, NaN, 1, NaN]);
    const pn = new Float32Array([NaN, NaN, 0, NaN]);
    dilateSwell({ id: 'q', west: 0, south: 0, nx: 2, ny: 2, offset: 0 }, 0, hs, per, pe, pn, 1);
    expect([...hs]).toEqual([1, 1, 1, 1]);
    expect(pe[0]).toBeCloseTo(1, 5);
  });
});

describe('tempo', () => {
  it('hora de Lisboa → epoch (WEST no verão, WET no inverno)', () => {
    expect(lisbonLocalToEpochMs('2026-10-08T02:00')).toBe(Date.UTC(2026, 9, 8, 1));
    expect(lisbonLocalToEpochMs('2026-12-01T12:00')).toBe(Date.UTC(2026, 11, 1, 12));
    expect(lisbonLocalToEpochMs('xx')).toBeNull();
  });

  it('índice fraccionário e janela', () => {
    const g = { t0: 1_800_000_000, stepHours: 1, nt: 3 };
    expect(seaGridTimeIndex(g, 1_800_000_000_000)).toBe(0);
    expect(seaGridTimeIndex(g, 1_800_005_400_000)).toBeCloseTo(1.5, 6);
    // meia hora antes de t0 ainda conta como t0 («Agora» às hh:20)
    expect(seaGridTimeIndex(g, (1_800_000_000 - 1200) * 1000)).toBe(0);
    expect(seaGridTimeIndex(g, (1_800_000_000 - 3600) * 1000)).toBeNull();
    expect(seaGridTimeIndex(g, (1_800_000_000 + 3 * 3600) * 1000)).toBeNull();
  });

  it('seaGridFrame interpola no tempo e dá os extremos', () => {
    const g = parseSeaGrid(synthetic())!;
    const f = seaGridFrame(g, 0.5);
    expect(f.v[0]).toBeCloseTo(-15, 4);
    expect(f.hs[0]).toBeCloseTo(1.5, 4);
    expect(f.per[0]).toBeCloseTo(13, 4);
    expect(f.windMaxKt).toBeCloseTo(15 * 1.943844, 2);
    expect(f.hsMin).toBeCloseTo(1.5, 4);
    expect(f.hsMax).toBeCloseTo(2.5, 4);
    // reutiliza o buffer
    const f2 = seaGridFrame(g, 1, f);
    expect(f2).toBe(f);
    expect(f2.hs[0]).toBeCloseTo(2, 4);
  });
});

describe('sampleSeaGrid', () => {
  it('bilinear dentro da caixa, null fora; direcção de onde vem (v1)', () => {
    const g = parseSeaGrid(syntheticV1())!;
    expect(g.legacy).toBe(true);
    const f = seaGridFrame(g, 0);
    const mid = sampleSeaGrid(g, f, 38.25, -9.75)!;
    expect(mid.hs).toBeCloseTo(1.5, 4);
    expect(mid.w).toBeCloseTo(1, 5);
    expect(mid.kt).toBeCloseTo(10 * 1.943844, 3);
    expect(mid.windFrom).toBeCloseTo(0, 3);
    expect(mid.swellFrom).toBeGreaterThan(313);
    expect(mid.swellFrom).toBeLessThan(317);
    expect(sampleSeaGrid(g, f, 50, -9.5)).toBeNull();
    // borda: 1 no interior, ~0 meia célula para lá do último nó (sem corte recto)
    expect(mid.edge).toBe(1);
    expect(sampleSeaGrid(g, f, 38.25, -10.2)!.edge).toBeCloseTo(0.1, 5);
    expect(sampleSeaGrid(g, f, 38.25, -9.75)!.edge).toBe(1);
    expect(seaGridBoxAt(g, 38.74, -8.76)).not.toBeNull();
  });
});

// ── v2: caixas sobrepostas, máscara de nós, fusão fina → grossa ──────────

const HOURS = { times: [1_800_000_000, 1_800_003_600], idx: [0, 1] };

/** Uma caixa grossa (1°) uniforme e uma fina (0,5°) com outro valor por dentro. */
function nested({ fineStoredAll = true } = {}) {
  const boxes: Array<{ id: string; west: number; south: number; nx: number; ny: number; step: number }> = [
    { id: 'fine', west: -12, south: 36, nx: 9, ny: 9, step: 0.5 }, // -12..-8, 36..40
    { id: 'coarse', west: -16, south: 32, nx: 13, ny: 13, step: 1 }, // -16..-4, 32..44
  ];
  const nodes: Array<{ lat: number; lon: number; fetch: boolean; store: boolean; box: string }> = [];
  for (const b of boxes) {
    for (let j = 0; j < b.ny; j++) {
      for (let i = 0; i < b.nx; i++) {
        // fina: só a metade leste é «costeira» quando fineStoredAll = false
        const keep = b.id === 'coarse' || fineStoredAll || i >= 4;
        nodes.push({ lat: b.south + j * b.step, lon: b.west + i * b.step, fetch: keep, store: keep, box: b.id });
      }
    }
  }
  const wind = nodes.map((n) =>
    n.fetch ? { wind_speed_10m: n.box === 'fine' ? [20, 20] : [10, 10], wind_direction_10m: [270, 270] } : null,
  );
  const marine = nodes.map((n) =>
    n.fetch
      ? { wave_height: n.box === 'fine' ? [3, 3] : [1, 1], swell_wave_direction: [300, 300], swell_wave_period: [12, 12] }
      : null,
  );
  const raw = enc.encodeSeaGrid({ boxes, nodes, wind, marine, ...HOURS, generatedAt: 'g', source: 's' });
  return JSON.parse(JSON.stringify(raw));
}

describe('sea-grid v2', () => {
  it('máscara de nós: só os guardados ocupam bytes; os outros ficam NaN', () => {
    const raw = nested({ fineStoredAll: false });
    expect(raw.v).toBe(2);
    expect(raw.boxes[0]).toMatchObject({ id: 'fine', step: 0.5, offset: 0, count: 45 });
    expect(typeof raw.boxes[0].mask).toBe('string');
    expect(raw.boxes[1].mask).toBeUndefined();
    expect(raw.n).toBe(45 + 169);
    const g = parseSeaGrid(raw)!;
    expect(g.legacy).toBe(false);
    expect(g.n).toBe(81 + 169); // layout completo
    expect(g.step).toBe(0.5);
    // nó (0,0) da fina não guardado → NaN (o dilate só enche vizinhos de nós válidos)
    expect(Number.isNaN(g.u[0])).toBe(true);
    expect(g.u[4]).toBeCloseTo(20, 4);
    // máscara com contagem errada → rejeita
    const bad = nested({ fineStoredAll: false });
    bad.boxes[0].count = 44;
    expect(parseSeaGrid(bad)).toBeNull();
  });

  it('prefere a caixa mais fina e funde na grossa sem costura', () => {
    const g = parseSeaGrid(nested())!;
    const f = seaGridFrame(g, 0);
    expect(seaGridBoxAt(g, 38, -10)!.id).toBe('fine');
    expect(seaGridExtent(g)).toEqual({ west: -16, south: 32, east: -4, north: 44 });
    // interior da fina (≥ 2 células da borda): valor da fina
    const inside = sampleSeaGrid(g, f, 38, -10)!;
    expect(inside.hs).toBeCloseTo(3, 3);
    expect(inside.kt).toBeCloseTo(20 * 1.943844, 2);
    // na borda da fina: valor da grossa
    expect(sampleSeaGrid(g, f, 38, -12)!.hs).toBeCloseTo(1, 3);
    // a meio da faixa de fusão: entre os dois
    const half = sampleSeaGrid(g, f, 38, -12 + (SEA_GRID_BLEND_CELLS * 0.5) / 2)!;
    expect(half.hs).toBeGreaterThan(1.5);
    expect(half.hs).toBeLessThan(2.5);
    // fora da fina, dentro da grossa: grossa
    expect(sampleSeaGrid(g, f, 38, -14)!.hs).toBeCloseTo(1, 3);
    // sem saltos: atravessar a borda da fina em passos de 0,01° nunca muda > 0,1 m
    let prev = sampleSeaGrid(g, f, 38, -13)!.hs;
    let maxJump = 0;
    for (let lon = -12.99; lon <= -10; lon += 0.01) {
      const h = sampleSeaGrid(g, f, 38, lon)!.hs;
      maxJump = Math.max(maxJump, Math.abs(h - prev));
      prev = h;
    }
    expect(maxJump).toBeLessThan(0.1);
    expect(inside.w).toBeCloseTo(1, 5);
  });

  it('nós finos não guardados (mar aberto longe da costa) caem na grossa', () => {
    const g = parseSeaGrid(nested({ fineStoredAll: false }))!;
    const f = seaGridFrame(g, 0);
    // metade oeste da fina sem nós → grossa; metade leste → fina
    expect(sampleSeaGrid(g, f, 38, -11.4)!.hs).toBeCloseTo(1, 3);
    expect(sampleSeaGrid(g, f, 38, -9)!.hs).toBeCloseTo(3, 3);
    expect(sampleSeaGrid(g, f, 38, -11.4)!.w).toBeCloseTo(1, 5);
  });

  it('borda exterior do domínio esbatida ao longo de ~1°, sem corte recto', () => {
    const g = parseSeaGrid(nested())!;
    const f = seaGridFrame(g, 0);
    expect(sampleSeaGrid(g, f, 38, -16)!.edge).toBeCloseTo(0, 5);
    expect(sampleSeaGrid(g, f, 38, -15.5)!.edge).toBeCloseTo(0.5, 5);
    expect(sampleSeaGrid(g, f, 38, -15)!.edge).toBeCloseTo(1, 5);
    expect(sampleSeaGrid(g, f, 43.75, -10)!.edge).toBeCloseTo(0.25, 5);
    expect(sampleSeaGrid(g, f, 38, -16.1)).toBeNull();
  });

  it('o ficheiro publicado (se existir) descodifica e cobre o Atlântico Norte inteiro', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(__dirname, '../../../public/data/sea-grid.json');
    if (!fs.existsSync(file)) return;
    const g = parseSeaGrid(JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(g).not.toBeNull();
    const ext = seaGridExtent(g!);
    expect(ext.west).toBeLessThanOrEqual(-34);
    expect(ext.east).toBeGreaterThanOrEqual(-1);
    expect(ext.south).toBeLessThanOrEqual(27);
    expect(ext.north).toBeGreaterThanOrEqual(46.5);
    if (g!.version === 3) {
      // domínio v3 muito maior que qualquer vista do /mapa
      expect(ext).toMatchObject({ west: SEA_DOMAIN.west, east: SEA_DOMAIN.east, south: SEA_DOMAIN.south, north: SEA_DOMAIN.north });
      const f = seaGridFrame(g!, 0);
      // sem faixa vazia na costa: Aveiro, na praia, lê ondulação e vento de mar
      const beach = sampleSeaGrid(g!, f, 40.64, -8.75)!;
      expect(beach.hs).toBeGreaterThan(0);
      expect(beach.w).toBeGreaterThan(0.95);
      expect(Number.isFinite(beach.u)).toBe(true);
      // Mediterrâneo central: o WW3 não tem ondulação lá (só vento)
      const med = sampleSeaGrid(g!, f, 38, 15)!;
      expect(med.w).toBeLessThan(0.05);
      expect(Number.isFinite(med.u)).toBe(true);
      // o interior do pan do /mapa nunca toca no esbatido
      const b = SEA_DOMAIN_VIEW_BOUNDS;
      for (const [la, lo] of [[b.south, b.west], [b.north, b.east], [b.south, b.east], [b.north, b.west]]) {
        expect(sampleSeaGrid(g!, f, la, lo)!.edge).toBe(1);
      }
    }
  });
});

describe('v3 — grelha de modelo preenchida (GFS + WW3)', () => {
  it('buildFillPlan: anéis BFS a partir do mar; alcance limitado', () => {
    // 5×1: mar só no nó 0
    const plan = buildFillPlan(5, 1, [1, 0, 0, 0, 0]);
    expect([...plan.order]).toEqual([1, 2, 3, 4]);
    const a = new Float32Array([2, NaN, NaN, NaN, NaN]);
    applyFillPlan(plan, a, 0);
    expect([...a]).toEqual([2, 2, 2, 2, 2]);
    const rings = new Int32Array(5);
    const short = buildFillPlan(5, 1, [1, 0, 0, 0, 0], 2, rings);
    expect([...short.order]).toEqual([1, 2]);
    expect([...rings]).toEqual([0, 1, 2, -1, -1]);
    // média dos vizinhos já preenchidos (8-vizinhança)
    const p2 = buildFillPlan(3, 1, [1, 0, 1]);
    const b = new Float32Array([1, NaN, 3]);
    applyFillPlan(p2, b, 0);
    expect(b[1]).toBe(2);
  });

  it('parse v3: terra preenchida com o mar mais próximo, cobertura esbatida, fade da borda', () => {
    const sg = enc;
    const tiers = [{ id: 'core', step: 0.5, south: 38, north: 40, west: -11, east: -8 }];
    const nx = 7;
    const ny = 5;
    const n = nx * ny;
    const times = [1_800_000_000, 1_800_000_000 + 3 * 3600];
    const nan = () => new Float32Array(times.length * n).fill(NaN);
    const d = { u: nan(), v: nan(), hs: nan(), sdir: nan(), sper: nan(), tdir: nan(), tper: nan() };
    // mar a oeste de -9.5 (i ≤ 3), «terra» a leste
    for (let t = 0; t < times.length; t++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const o = t * n + j * nx + i;
          d.u[o] = 4;
          d.v[o] = -2;
          if (i <= 3) {
            d.hs[o] = 2;
            d.sdir[o] = 300;
            d.sper[o] = 12;
          }
        }
      }
    }
    const file = sg.encodeGriddedSeaGrid({ tiers, data: [d], times, generatedAt: new Date().toISOString(), source: 't' });
    expect(file.v).toBe(3);
    expect(file.fade).toBe(4);
    expect(file.stepHours).toBe(3);
    expect(file.n).toBe(4 * ny); // só nós de mar guardados
    const g = parseSeaGrid(file)!;
    expect(g.version).toBe(3);
    const f = seaGridFrame(g, 0.5);
    // nó de terra a 1 célula da costa: valor do mar, cobertura cheia
    const k1 = g.boxes[0].offset + 2 * nx + 4;
    expect(f.hs[k1]).toBeCloseTo(2, 5);
    expect(g.cov![k1]).toBe(1);
    expect(f.u[k1]).toBeCloseTo(4, 5);
    // bilinear junto à costa = mar a sério (sem faixa escura)
    const s = sampleSeaGrid(g, f, 39, -9.3)!;
    expect(s.hs).toBeCloseTo(2, 4);
    expect(s.w).toBeCloseTo(1, 4);
    expect(s.swellFrom).toBeCloseTo(300, 0);
    // esbatido de 4° (v3) — a caixa de teste é toda «borda»
    expect(s.edge).toBeLessThan(1);
  });
});
