import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  RADAR_BOUNDS,
  MANIFEST_URL,
  parseManifest,
  pickLatestFrame,
  pickFrames,
  frameIso,
  buildRadarPayload,
  fetchRadarManifest,
} = require('../ipmaRadar.js');

const FRAME = { date: '2026-08-14 18:35', path: 'pcr-2026-08-14T1835.png' };
const FRAMES = [
  FRAME,
  { date: '2026-08-14 18:30', path: 'pcr-2026-08-14T1830.png' },
  { date: '2026-08-14 18:25', path: 'pcr-2026-08-14T1825.png' },
];

describe('parseManifest', () => {
  it('extrai os frames do mosaico Continente (Portugal)', () => {
    const frames = parseManifest({
      Portugal: [FRAME, { date: '2026-08-14 18:30', path: 'pcr-2026-08-14T1830.png' }],
      Lisboa: [{ date: '2026-08-14 18:35', path: 'lis-xxx.png' }],
    });
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual(FRAME);
  });

  it('filtra entradas inválidas e tolera shape diferente', () => {
    expect(parseManifest({ Portugal: [null, { path: 'x.txt' }, { date: 'x', path: 'ok.png' }] }))
      .toEqual([{ date: 'x', path: 'ok.png' }]);
    expect(parseManifest(null)).toEqual([]);
    expect(parseManifest({})).toEqual([]);
    expect(parseManifest({ Portugal: 'nope' })).toEqual([]);
  });
});

describe('pickLatestFrame', () => {
  it('devolve a primeira entrada (o manifest vem newest-first)', () => {
    expect(pickLatestFrame([FRAME, { date: 'x', path: 'y.png' }])).toEqual(FRAME);
  });
  it('devolve null sem frames', () => {
    expect(pickLatestFrame([])).toBeNull();
    expect(pickLatestFrame(null)).toBeNull();
  });
});

describe('pickFrames', () => {
  it('devolve os N mais recentes (default 12)', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-14 18:${String(55 - i).padStart(2, '0')}`, path: `pcr-${i}.png` }));
    const picked = pickFrames(many);
    expect(picked).toHaveLength(12);
    expect(picked[0]).toBe(many[0]);
    expect(picked[11]).toBe(many[11]);
  });
  it('respeita o count pedido e tolera listas curtas/inválidas', () => {
    expect(pickFrames(FRAMES, 2)).toHaveLength(2);
    expect(pickFrames(FRAMES, 99)).toHaveLength(3);
    expect(pickFrames([], 5)).toEqual([]);
    expect(pickFrames(null, 5)).toEqual([]);
  });
});

describe('frameIso', () => {
  it('converte "YYYY-MM-DD HH:MM" (UTC) em ISO', () => {
    expect(frameIso('2026-08-14 18:35')).toBe('2026-08-14T18:35:00.000Z');
  });
  it('devolve null para datas inválidas', () => {
    expect(frameIso('')).toBeNull();
    expect(frameIso('nope')).toBeNull();
    expect(frameIso(null)).toBeNull();
  });
});

describe('buildRadarPayload', () => {
  it('produz radar.json com source, frameTime, bounds oficiais e caminho da imagem', () => {
    const p = buildRadarPayload(FRAMES, Date.UTC(2026, 7, 14, 18, 47, 0));
    expect(p.source).toBe('ipma-radar');
    expect(p.fetchedAt).toBe('2026-08-14T18:47:00.000Z');
    expect(p.frameTime).toBe('2026-08-14T18:35:00.000Z');
    expect(p.framePath).toBe('pcr-2026-08-14T1835.png');
    expect(p.imagePath).toBe('radar/ipma-radar.png');
    expect(p.bounds).toEqual(RADAR_BOUNDS);
    expect(p.attribution).toBe('IPMA');
  });

  it('inclui a lista de frames do carrossel (newest-first, 5 min)', () => {
    const p = buildRadarPayload(FRAMES);
    expect(p.frames).toHaveLength(3);
    expect(p.frames[0]).toEqual({
      frameTime: '2026-08-14T18:35:00.000Z',
      framePath: 'pcr-2026-08-14T1835.png',
      imagePath: 'radar/frames/pcr-2026-08-14T1835.png',
    });
    expect(p.frames[2].frameTime).toBe('2026-08-14T18:25:00.000Z');
  });

  it('tolera lista vazia (frameTime null, frames [])', () => {
    const p = buildRadarPayload([]);
    expect(p.frameTime).toBeNull();
    expect(p.framePath).toBeNull();
    expect(p.frames).toEqual([]);
  });
});

describe('fetchRadarManifest', () => {
  it('faz fetch do manifest e devolve os frames parseados', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Portugal: [FRAME] }),
    }));
    const frames = await fetchRadarManifest(fetchImpl);
    expect(frames).toEqual([FRAME]);
    expect(fetchImpl.mock.calls[0][0]).toBe(MANIFEST_URL);
  });

  it('lança erro em resposta não-OK', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(fetchRadarManifest(fetchImpl)).rejects.toThrow(/503/);
  });
});
