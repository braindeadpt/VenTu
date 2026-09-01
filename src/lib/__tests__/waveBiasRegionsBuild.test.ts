import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  loadWaveBiasRegionsBuild,
  clearWaveBiasRegionsBuildCache,
  type WaveBiasRegionsFs,
} from '../waveBias';

function mockFs(exists: boolean, content?: string): WaveBiasRegionsFs & {
  readCalls: ReturnType<typeof vi.fn>;
} {
  const readCalls = vi.fn(() => (exists ? content ?? '' : ''));
  return {
    existsSync: vi.fn(() => exists),
    readFileSync: readCalls as unknown as WaveBiasRegionsFs['readFileSync'],
    readCalls,
  };
}

describe('loadWaveBiasRegionsBuild (fallback regional build-time — TopNow/SSG)', () => {
  beforeEach(() => {
    clearWaveBiasRegionsBuildCache();
  });

  it('devolve as regions do wave-bias.json quando o ficheiro existe', () => {
    const fs = mockFs(
      true,
      JSON.stringify({
        fetchedAt: '2026-08-15T06:00:00.000Z',
        regions: {
          Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
          Porto: { n: 86, me: 0.4, mae: 0.5, rmse: 0.6 },
        },
      }),
    );

    const file = loadWaveBiasRegionsBuild(fs, '/virtual/wave-bias.json');
    expect(file?.regions?.Cascais).toMatchObject({ n: 120, me: 0.3 });
    expect(file?.regions?.Porto).toMatchObject({ n: 86, me: 0.4 });
  });

  it('devolve null sem ficheiro (fallback nunca aplica — mesmo comportamento do client)', () => {
    const fs = mockFs(false);
    expect(loadWaveBiasRegionsBuild(fs, '/virtual/wave-bias.json')).toBeNull();
  });

  it('cacheia por build: uma só leitura de disco', () => {
    const fs = mockFs(true, JSON.stringify({ regions: { Cascais: { n: 120, me: 0.3 } } }));

    loadWaveBiasRegionsBuild(fs, '/virtual/wave-bias.json');
    loadWaveBiasRegionsBuild(fs, '/virtual/wave-bias.json');
    expect(fs.readCalls).toHaveBeenCalledTimes(1);
  });

  it('corrupto/falha de leitura → null (nunca rebenta o build)', () => {
    const fs = {
      existsSync: () => true,
      readFileSync: () => {
        throw new Error('boom');
      },
    } as WaveBiasRegionsFs;
    expect(loadWaveBiasRegionsBuild(fs, '/virtual/wave-bias.json')).toBeNull();
  });

  it('sem fsImpl (produção) nunca devolve null por causa do fs — usa require real', () => {
    // Sem mock: no vitest (node), o require('fs') real devolve null quando o
    // ficheiro não existe — o fallback desliga silenciosamente.
    const file = loadWaveBiasRegionsBuild(undefined, '/virtual/definitely-missing.json');
    expect(file).toBeNull();
  });
});
