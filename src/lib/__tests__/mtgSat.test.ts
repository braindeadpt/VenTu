import { describe, expect, it } from 'vitest';
import {
  fetchMtgSatManifest,
  mtgSatBounds,
  mtgSatFrames,
  mtgSatIsFresh,
  type MtgSatManifest,
} from '../mtgSat';

const manifest: MtgSatManifest = {
  source: 'eumetsat-mtg-fci',
  fetchedAt: '2026-10-05T02:12:44.000Z',
  cadenceMin: 10,
  bounds: { south: 28, west: -34, north: 52, east: 1 },
  attribution: 'EUMETSAT',
  frames: [
    { frameTime: '2026-10-05T01:50:06.000Z', imagePath: 'sat-mtg/frames/fci-2026-10-05T0150.png' },
    { frameTime: '2026-10-05T01:40:06.000Z', imagePath: 'sat-mtg/frames/fci-2026-10-05T0140.png' },
  ],
};

describe('mtgSat — manifest da pipeline EUMETSAT', () => {
  it('fetchMtgSatManifest devolve o manifest quando o fetch responde OK', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify(manifest), { status: 200 });
    const m = await fetchMtgSatManifest(fetchImpl as typeof fetch);
    expect(m?.frames).toHaveLength(2);
    expect(m?.bounds.west).toBe(-34);
  });

  it('fetchMtgSatManifest devolve null em HTTP erro / JSON inválido / frames vazios', async () => {
    const bad = await fetchMtgSatManifest(
      (async () => new Response('nope', { status: 404 })) as typeof fetch,
    );
    expect(bad).toBeNull();
    const empty = await fetchMtgSatManifest(
      (async () =>
        new Response(JSON.stringify({ ...manifest, frames: [] }), { status: 200 })) as typeof fetch,
    );
    expect(empty).toBeNull();
    const boom = await fetchMtgSatManifest(
      (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    );
    expect(boom).toBeNull();
  });

  it('mtgSatFrames mapeia para {url, frameTime} com prefixo /data/', () => {
    const frames = mtgSatFrames(manifest);
    expect(frames[0]).toEqual({
      url: '/data/sat-mtg/frames/fci-2026-10-05T0150.png',
      frameTime: '2026-10-05T01:50:06.000Z',
    });
  });

  it('mtgSatBounds devolve [[S,W],[N,E]] para L.imageOverlay', () => {
    expect(mtgSatBounds(manifest)).toEqual([
      [28, -34],
      [52, 1],
    ]);
  });

  it('mtgSatIsFresh: frame mais recente dentro de 3 h = fresco', () => {
    const now = Date.parse('2026-10-05T02:30:00Z');
    expect(mtgSatIsFresh(manifest, now)).toBe(true);
  });

  it('mtgSatIsFresh: pipeline morta (>3 h sem frame novo) = stale → fallback GIBS', () => {
    const now = Date.parse('2026-10-06T10:00:00Z');
    expect(mtgSatIsFresh(manifest, now)).toBe(false);
  });

  it('mtgSatIsFresh: frameTime inválido = stale', () => {
    const broken = { ...manifest, frames: [{ frameTime: 'lixo', imagePath: 'x.png' }] };
    expect(mtgSatIsFresh(broken)).toBe(false);
  });
});
