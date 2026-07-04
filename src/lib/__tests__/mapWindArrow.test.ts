import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  blowUnitVector,
  windArrowColorRgb,
  windRayLength,
  windWedgeHalfWidth,
  windWedgePolygon,
  markerPxForZoom,
  markerWindArrowLayout,
  buildCompoundSpotMarkerSvg,
  buildCompoundSpotMarkerHtml,
  buildMapWindArrowTitle,
  MARKER_MIN_PX,
  MARKER_VIEWBOX_W,
} from '../mapWindArrow';

describe('mapWindArrow wind wedge marker', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
  });

  it('north wind wedge points south', () => {
    const { uy } = blowUnitVector(180);
    expect(uy).toBeGreaterThan(0);
  });

  it('wedge length is always athlete-readable (>=32)', () => {
    expect(windRayLength(2)).toBeGreaterThanOrEqual(32);
    expect(windRayLength(25)).toBeGreaterThanOrEqual(48);
  });

  it('marker px floor is large (88px at low zoom)', () => {
    expect(markerPxForZoom(6)).toBe(MARKER_MIN_PX);
    expect(MARKER_MIN_PX).toBeGreaterThanOrEqual(88);
  });

  it('wedge polygon is a filled triangle path', () => {
    const d = windWedgePolygon(0, 15, 64, 56, 20);
    expect(d).toContain(' Z');
    expect(d.split('L').length).toBe(3);
  });

  it('compound svg uses wind wedge + pin', () => {
    const svg = buildCompoundSpotMarkerSvg(78, 'rgb(16,185,129)', 270, 18, true);
    expect(svg).toContain('ventu-wind-wedge');
    expect(svg).toContain('ventu-marker-pin');
    expect(svg).toContain(`viewBox="0 0 ${MARKER_VIEWBOX_W}`);
    expect(svg).toContain('>78<');
  });

  it('layout taller than pin-only', () => {
    expect(markerWindArrowLayout(true, 124).iconSize[1]).toBeGreaterThan(120);
    expect(markerWindArrowLayout(false).iconSize[1]).toBe(44);
  });

  it('html embeds large pixel size', () => {
    const html = buildCompoundSpotMarkerHtml(80, 'rgb(1,2,3)', 90, 12, true, 'pt', 100);
    expect(html).toContain('width:100px');
    expect(html).toContain('asa = para onde sopra');
  });

  it('wedge widens slightly with speed', () => {
    expect(windWedgeHalfWidth(20)).toBeGreaterThan(windWedgeHalfWidth(5));
  });

  it('colour ramp matches windy steps', () => {
    expect(windArrowColorRgb(5)).toEqual([14, 165, 233]);
    expect(windArrowColorRgb(35)).toEqual([239, 68, 68]);
  });
});
