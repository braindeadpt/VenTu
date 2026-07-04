import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  blowUnitVector,
  windArrowColorRgb,
  windRayLength,
  windRayGeometry,
  markerPxForZoom,
  markerWindArrowLayout,
  buildCompoundSpotMarkerSvg,
  buildCompoundSpotMarkerHtml,
  buildMapWindArrowTitle,
  MARKER_MIN_PX,
  MARKER_VIEWBOX_W,
} from '../mapWindArrow';

describe('mapWindArrow compound marker', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(90)).toBe(270);
  });

  it('blow unit vector: north wind blows south (down)', () => {
    const { ux, uy } = blowUnitVector(180);
    expect(ux).toBeCloseTo(0, 5);
    expect(uy).toBeGreaterThan(0);
  });

  it('speed maps to colour ramp', () => {
    expect(windArrowColorRgb(5)).toEqual([56, 189, 248]);
    expect(windArrowColorRgb(35)).toEqual([248, 113, 113]);
  });

  it('ray length grows with speed (14–38 viewBox units)', () => {
    expect(windRayLength(3)).toBe(14);
    expect(windRayLength(15)).toBe(26);
    expect(windRayLength(35)).toBe(38);
  });

  it('ray starts on circle rim and extends outward', () => {
    const geo = windRayGeometry(0, 24);
    const dist = Math.hypot(geo.x1 - 44, geo.y1 - 38);
    expect(dist).toBeCloseTo(17, 1);
    const rayLen = Math.hypot(geo.x2 - geo.x1, geo.y2 - geo.y1);
    expect(rayLen).toBeCloseTo(24, 1);
    expect(geo.chevron).toContain('M');
  });

  it('marker px grows with zoom', () => {
    expect(markerPxForZoom(7)).toBe(MARKER_MIN_PX);
    expect(markerPxForZoom(12)).toBeGreaterThan(MARKER_MIN_PX);
  });

  it('compound layout is single glyph taller than pin-only', () => {
    const withWind = markerWindArrowLayout(true, 76);
    const withoutWind = markerWindArrowLayout(false);
    expect(withWind.iconSize[1]).toBeGreaterThan(withoutWind.iconSize[1]);
  });

  it('compound svg is one glyph with ray + pin', () => {
    const svg = buildCompoundSpotMarkerSvg(78, 'rgb(16,185,129)', 270, 18, true);
    expect(svg).toContain('ventu-compound-marker');
    expect(svg).toContain('ventu-wind-ray');
    expect(svg).toContain('ventu-marker-pin');
    expect(svg).not.toContain('ventu-spot-wind');
    expect(svg).toContain('>78<');
  });

  it('no wind ray when disabled', () => {
    const svg = buildCompoundSpotMarkerSvg(60, 'rgb(200,100,50)', 0, 10, false);
    expect(svg).not.toContain('ventu-wind-ray');
  });

  it('html wrapper uses compound classes', () => {
    const html = buildCompoundSpotMarkerHtml(80, 'rgb(1,2,3)', 90, 12, true, 'pt', 64);
    expect(html).toContain('ventu-compound-marker-wrap');
    expect(html).toContain('raio = para onde sopra');
  });

  it('title mentions ray and intensity', () => {
    expect(buildMapWindArrowTitle(0, 8, 'pt')).toContain('raio');
    expect(buildMapWindArrowTitle(0, 8, 'pt')).toContain('intensidade');
  });
});
