import { describe, it, expect } from 'vitest';
import {
  radarFrames,
  radarFrameClock,
  radarFrameFullClock,
  radarImageUrl,
  type IpmaRadarData,
} from '@/lib/ipmaRadar';

const DATA: IpmaRadarData = {
  source: 'ipma-radar',
  fetchedAt: '2026-08-15T01:05:00.000Z',
  frameTime: '2026-08-15T01:00:00.000Z',
  framePath: 'pcr-2026-08-15T0100.png',
  imagePath: 'radar/ipma-radar.png',
  frames: [
    {
      frameTime: '2026-08-15T01:00:00.000Z',
      framePath: 'pcr-2026-08-15T0100.png',
      imagePath: 'radar/frames/pcr-2026-08-15T0100.png',
    },
    {
      frameTime: '2026-08-15T00:55:00.000Z',
      framePath: 'pcr-2026-08-15T0055.png',
      imagePath: 'radar/frames/pcr-2026-08-15T0055.png',
    },
  ],
  bounds: { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 },
  attribution: 'IPMA',
};

describe('radarFrames', () => {
  it('devolve as URLs dos frames do carrossel (newest-first)', () => {
    const frames = radarFrames(DATA);
    expect(frames).toHaveLength(2);
    expect(frames[0].url).toContain('/data/radar/frames/pcr-2026-08-15T0100.png');
    expect(frames[0].frameTime).toBe('2026-08-15T01:00:00.000Z');
    expect(frames[1].frameTime).toBe('2026-08-15T00:55:00.000Z');
  });

  it('faz fallback ao frame único quando o manifest não tem lista frames (formato antigo)', () => {
    const { frames: _frames, ...legacy } = DATA;
    const frames = radarFrames(legacy as IpmaRadarData);
    expect(frames).toHaveLength(1);
    expect(frames[0].url).toBe(radarImageUrl(legacy as IpmaRadarData));
    expect(frames[0].frameTime).toBe(legacy.frameTime);
  });

  it('nunca devolve lista vazia (fallback à imagem default)', () => {
    expect(radarFrames(null)).toHaveLength(1);
  });
});

describe('radarFrameClock', () => {
  it('extrai HH:mm do ISO (wall-clock Lisboa, sem shift de fuso)', () => {
    expect(radarFrameClock('2026-08-15T01:00:00.000Z')).toBe('01:00');
    expect(radarFrameClock('2026-08-14T18:35:00.000Z')).toBe('18:35');
  });

  it('devolve null para entradas inválidas', () => {
    expect(radarFrameClock(null)).toBeNull();
    expect(radarFrameClock('')).toBeNull();
    expect(radarFrameClock('nope')).toBeNull();
  });
});

describe('radarFrameFullClock', () => {
  it('devolve data + hora do ISO (sem shift de fuso)', () => {
    expect(radarFrameFullClock('2026-08-15T01:00:00.000Z')).toBe('2026-08-15 01:00');
    expect(radarFrameFullClock('2026-08-14T18:35:00.000Z')).toBe('2026-08-14 18:35');
  });

  it('distingue frames de dias diferentes (mudança de dia no meio do carrossel)', () => {
    expect(radarFrameFullClock('2026-08-15T00:05:00.000Z')).toBe('2026-08-15 00:05');
    expect(radarFrameFullClock('2026-08-14T23:55:00.000Z')).toBe('2026-08-14 23:55');
  });

  it('devolve null para entradas inválidas', () => {
    expect(radarFrameFullClock(null)).toBeNull();
    expect(radarFrameFullClock('')).toBeNull();
    expect(radarFrameFullClock('nope')).toBeNull();
    expect(radarFrameFullClock('2026-08-15')).toBeNull(); // sem hora
  });
});
