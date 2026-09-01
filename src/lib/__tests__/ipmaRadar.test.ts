import { describe, it, expect } from 'vitest';
import {
  radarFrames,
  radarFrameClock,
  radarFrameFullClock,
  radarImageUrl,
  radarMissingFrames,
  RADAR_CADENCE_MIN,
  type IpmaRadarData,
  type RadarFrameAsset,
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

describe('radarMissingFrames', () => {
  /** Frame asset sintético apenas com o instante (url dummy). */
  const at = (iso: string): RadarFrameAsset => ({ url: `/data/radar/frames/x.png`, frameTime: iso });

  it('cadência contígua → nenhum frame em falta', () => {
    const frames = [at('2026-08-15T01:00:00.000Z'), at('2026-08-15T00:55:00.000Z'), at('2026-08-15T00:50:00.000Z')];
    expect(radarMissingFrames(frames)).toEqual([0, 0, 0]);
  });

  it('um slot de 5 min em falta (gap de 10 min) → 1 frame', () => {
    const frames = [at('2026-08-15T01:00:00.000Z'), at('2026-08-15T00:50:00.000Z')];
    expect(radarMissingFrames(frames)).toEqual([1, 0]);
  });

  it('gap grande (25 min = 5 cadências) → 4 frames em falta consecutivos', () => {
    const frames = [at('2026-08-15T01:00:00.000Z'), at('2026-08-15T00:35:00.000Z')];
    expect(radarMissingFrames(frames)).toEqual([4, 0]);
  });

  it('ignora frameTime ausente/inválido e o fim da lista (0)', () => {
    const frames = [
      at('2026-08-15T01:00:00.000Z'),
      { url: 'x', frameTime: null } as RadarFrameAsset, // sem hora → i0 guarda 0
      at('2026-08-15T00:50:00.000Z'),
      at('2026-08-15T00:40:00.000Z'),
      at('2026-08-15T00:35:00.000Z'),
    ];
    // i1 a=null → 0; i2 delta 10 min → 1; i3 delta 5 min → 0; i4 último → 0.
    expect(radarMissingFrames(frames)).toEqual([0, 0, 1, 0, 0]);
  });

  it('devia estar alinhado com a cadência oficial de 5 min', () => {
    expect(RADAR_CADENCE_MIN).toBe(5);
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
