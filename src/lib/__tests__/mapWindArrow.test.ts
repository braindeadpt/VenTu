import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  windArrowShaftLength,
  windArrowPxForZoom,
  windArrowColorRgb,
  markerWindArrowLayout,
  buildMapWindArrowSvg,
  buildMapWindArrowTitle,
  buildMapWindArrowHtml,
  WIND_ARROW_VIEWBOX,
} from '../mapWindArrow';

describe('mapWindArrow', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(90)).toBe(270);
  });

  it('shaft length scales with speed', () => {
    expect(windArrowShaftLength(2)).toBeLessThan(windArrowShaftLength(25));
  });

  it('color ramps with speed', () => {
    expect(windArrowColorRgb(3)).not.toEqual(windArrowColorRgb(25));
  });

  it('arrow px grows with zoom', () => {
    expect(windArrowPxForZoom(7)).toBeLessThan(windArrowPxForZoom(12));
    expect(windArrowPxForZoom(15)).toBe(windArrowPxForZoom(20));
  });

  it('marker layout reserves space for max arrow when wind is on', () => {
    const withWind = markerWindArrowLayout(true);
    const withoutWind = markerWindArrowLayout(false);
    expect(withWind.iconSize[1]).toBeGreaterThan(withoutWind.iconSize[1]);
  });

  it('builds high-contrast svg with pivot rotation', () => {
    const svg = buildMapWindArrowSvg(0, 15);
    expect(svg).toContain(`rotate(180 ${WIND_ARROW_VIEWBOX / 2}`);
    expect(svg).toContain(`width="${WIND_ARROW_VIEWBOX}"`);
    expect(svg).toContain('<circle');
  });

  it('title uses meteorological from-direction', () => {
    expect(buildMapWindArrowTitle(0, 12, 'pt')).toContain('de N');
    expect(buildMapWindArrowTitle(270, 8, 'en')).toContain('from W');
  });

  it('html wrapper includes accessible title', () => {
    const html = buildMapWindArrowHtml(90, 10, 'pt');
    expect(html).toContain('title=');
    expect(html).toContain('ventu-wind-arrow');
  });
});
