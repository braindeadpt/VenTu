import { describe, expect, it } from 'vitest';
import { getRegionGradientCss, getSpotAerialPath, getSpotImage, getSpotImageAlt } from '@/lib/spotImage';

describe('spotImage', () => {
  const base = {
    slug: 'guincho',
    name: 'Guincho',
    nameEn: 'Guincho',
    region: 'Lisboa',
    images: undefined as string[] | undefined,
  };

  it('returns curated image when URL exists', () => {
    const result = getSpotImage({ ...base, images: ['https://example.com/g.jpg'] });
    expect(result.kind).toBe('image');
    if (result.kind === 'image') {
      expect(result.src).toContain('example.com');
      expect(result.aerial).toBe(false);
    }
  });

  it('returns aerial path when no curated image', () => {
    const result = getSpotImage(base);
    expect(result.kind).toBe('image');
    if (result.kind === 'image') {
      expect(result.src).toBe(getSpotAerialPath('guincho'));
      expect(result.aerial).toBe(true);
    }
  });

  it('getSpotImageAlt is descriptive in PT', () => {
    expect(getSpotImageAlt(base, 'pt')).toBe('Vista aérea de Guincho');
  });

  it('getRegionGradientCss uses sunset/ocean tokens', () => {
    const css = getRegionGradientCss('Norte');
    expect(css).toContain('linear-gradient');
    expect(css).toContain('--accent-sunset');
  });

  it('gradient palettes differ by region', () => {
    const palettes = new Set(
      ['Lisboa', 'Algarve', 'Norte', 'Açores', 'Madeira'].map((region) =>
        getRegionGradientCss(region),
      ),
    );
    expect(palettes.size).toBeGreaterThan(1);
  });
});
