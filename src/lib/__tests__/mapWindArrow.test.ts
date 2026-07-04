import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  windArrowShaftLength,
  windArrowPxForZoom,
  windArrowColorRgb,
  markerWindArrowLayout,
  buildMarkerWindOverlaySvg,
  buildMapWindArrowTitle,
  buildMapWindArrowHtml,
  WIND_OVERLAY_VIEWBOX,
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

  it('marker layout keeps pin size — wind overflows', () => {
    const withWind = markerWindArrowLayout(true);
    const withoutWind = markerWindArrowLayout(false);
    expect(withWind.iconSize).toEqual(withoutWind.iconSize);
  });

  it('overlay svg has no origin dot — single vector on pin', () => {
    const svg = buildMarkerWindOverlaySvg(0, 15);
    expect(svg).toContain(`rotate(180 ${WIND_OVERLAY_VIEWBOX / 2}`);
    expect(svg).toContain('ventu-marker-wind');
    expect(svg).not.toContain('<circle');
  });

  it('title uses meteorological from-direction', () => {
    expect(buildMapWindArrowTitle(0, 12, 'pt')).toContain('de N');
    expect(buildMapWindArrowTitle(270, 8, 'en')).toContain('from W');
  });

  it('html wrapper includes accessible title', () => {
    const html = buildMapWindArrowHtml(90, 10, 'pt');
    expect(html).toContain('title=');
    expect(html).toContain('ventu-marker-wind');
  });
});
