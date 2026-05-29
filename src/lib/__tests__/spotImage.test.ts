import { describe, expect, it } from 'vitest';
import { getRegionGradientCss, getSpotImage } from '@/lib/spotImage';

describe('spotImage', () => {
  const base = {
    slug: 'guincho',
    name: 'Guincho',
    nameEn: 'Guincho',
    region: 'Lisboa',
    images: undefined as string[] | undefined,
  };

  it('returns image source when curated URL exists', () => {
    const result = getSpotImage({ ...base, images: ['https://example.com/g.jpg'] });
    expect(result.kind).toBe('image');
    if (result.kind === 'image') {
      expect(result.src).toContain('example.com');
    }
  });

  it('returns deterministic gradient per region when no image', () => {
    const a = getSpotImage(base);
    const b = getSpotImage(base);
    expect(a.kind).toBe('gradient');
    expect(b.kind).toBe('gradient');
    if (a.kind === 'gradient' && b.kind === 'gradient') {
      expect(a.background).toBe(b.background);
    }
    const palettes = new Set(
      ['Lisboa', 'Algarve', 'Norte', 'Açores', 'Madeira'].map((region) => {
        const r = getSpotImage({ ...base, region });
        return r.kind === 'gradient' ? r.background : '';
      }),
    );
    expect(palettes.size).toBeGreaterThan(1);
  });

  it('getRegionGradientCss uses sunset/ocean tokens', () => {
    const css = getRegionGradientCss('Norte');
    expect(css).toContain('linear-gradient');
    expect(css).toContain('--accent-sunset');
  });
});
