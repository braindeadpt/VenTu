import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  windArrowColorRgb,
  windArrowShaftLength,
  windArrowPxForZoom,
  markerWindArrowLayout,
  buildSpotWindArrowSvg,
  buildMapWindArrowTitle,
  buildMapWindArrowHtml,
} from '../mapWindArrow';

describe('mapWindArrow', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(90)).toBe(270);
  });

  it('speed maps to windy-style colour ramp', () => {
    expect(windArrowColorRgb(5)).toEqual([14, 165, 233]);
    expect(windArrowColorRgb(35)).toEqual([239, 68, 68]);
  });

  it('shaft grows with speed', () => {
    expect(windArrowShaftLength(3)).toBeLessThan(windArrowShaftLength(25));
  });

  it('arrow px grows with zoom', () => {
    expect(windArrowPxForZoom(8)).toBeLessThan(windArrowPxForZoom(12));
  });

  it('marker layout reserves height for arrow above pin', () => {
    const withWind = markerWindArrowLayout(true);
    const withoutWind = markerWindArrowLayout(false);
    expect(withWind.iconSize[1]).toBeGreaterThan(withoutWind.iconSize[1]);
  });

  it('builds windy-style arrow with origin dot and speed colour', () => {
    const svg = buildSpotWindArrowSvg(0, 18);
    expect(svg).toContain('rotate(180');
    expect(svg).toContain('<circle');
    expect(svg).toContain('rgb(6,182,212)');
  });

  it('title states from-direction, flow and intensity', () => {
    expect(buildMapWindArrowTitle(270, 12, 'pt')).toContain('de W');
    expect(buildMapWindArrowTitle(0, 8, 'en')).toContain('from N');
    expect(buildMapWindArrowTitle(0, 8, 'pt')).toContain('intensidade');
  });

  it('html wrapper for spot marker', () => {
    const html = buildMapWindArrowHtml(90, 10, 'pt');
    expect(html).toContain('ventu-spot-wind');
    expect(html).toContain('title=');
  });
});
