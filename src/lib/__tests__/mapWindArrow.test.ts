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
  WIND_ARROW_MIN_PX,
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

  it('shaft grows with speed (target ~22–28px at default render)', () => {
    expect(windArrowShaftLength(3)).toBe(18);
    expect(windArrowShaftLength(15)).toBe(25);
    expect(windArrowShaftLength(25)).toBeGreaterThanOrEqual(28);
  });

  it('arrow px grows with zoom', () => {
    expect(windArrowPxForZoom(7)).toBe(WIND_ARROW_MIN_PX);
    expect(windArrowPxForZoom(12)).toBeGreaterThan(WIND_ARROW_MIN_PX);
  });

  it('marker layout reserves height for large arrow above pin', () => {
    const withWind = markerWindArrowLayout(true, 72);
    const withoutWind = markerWindArrowLayout(false);
    expect(withWind.iconSize[1]).toBeGreaterThan(100);
    expect(withoutWind.iconSize[1]).toBe(44);
  });

  it('builds windy-style arrow with origin dot and speed colour', () => {
    const svg = buildSpotWindArrowSvg(0, 18);
    expect(svg).toContain('rotate(180');
    expect(svg).toContain('<circle');
    expect(svg).toContain('rgb(6,182,212)');
    expect(svg).not.toContain('width="56"');
  });

  it('title states from-direction, flow and intensity', () => {
    expect(buildMapWindArrowTitle(270, 12, 'pt')).toContain('de W');
    expect(buildMapWindArrowTitle(0, 8, 'en')).toContain('from N');
    expect(buildMapWindArrowTitle(0, 8, 'pt')).toContain('intensidade');
  });

  it('html wrapper embeds inline pixel size', () => {
    const html = buildMapWindArrowHtml(90, 10, 'pt', 56);
    expect(html).toContain('ventu-spot-wind');
    expect(html).toContain('style="width:56px;height:56px"');
  });
});
