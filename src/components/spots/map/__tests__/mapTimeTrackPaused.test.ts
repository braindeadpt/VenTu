import { describe, expect, it } from 'vitest';
import { mapTimeTrackPaused } from '@/components/spots/map/mapTimeTrackPaused';

const idle = {
  scrubbing: false,
  mapBusyCount: 0,
  offScreen: false,
  userPaused: false,
  reducedMotion: false,
};

describe('mapTimeTrackPaused', () => {
  it('plays when every source is idle', () => {
    expect(mapTimeTrackPaused(idle)).toBe(false);
  });

  it('pauses for scrubbing, map motion, off-screen, or user pause', () => {
    expect(mapTimeTrackPaused({ ...idle, scrubbing: true })).toBe(true);
    expect(mapTimeTrackPaused({ ...idle, mapBusyCount: 1 })).toBe(true);
    expect(mapTimeTrackPaused({ ...idle, offScreen: true })).toBe(true);
    expect(mapTimeTrackPaused({ ...idle, userPaused: true })).toBe(true);
  });

  it('prefers-reduced-motion always wins — autoplay stays off', () => {
    expect(mapTimeTrackPaused({ ...idle, reducedMotion: true })).toBe(true);
    expect(
      mapTimeTrackPaused({
        ...idle,
        reducedMotion: true,
        userPaused: false,
        mapBusyCount: 0,
      }),
    ).toBe(true);
  });
});
