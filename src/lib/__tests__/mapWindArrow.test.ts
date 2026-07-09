import { describe, it, expect } from 'vitest';
import {
  windBlowsToDegrees,
  blowUnitVector,
  windRingArcSpanDegrees,
  windRingRelation,
  windRingRelationClass,
  polarOnCircle,
  describeWindRingArc,
  windRingTipPolygon,
  markerIconLayout,
  buildWindRingMarkerSvg,
  buildWindRingMarkerHtml,
  buildMapWindRingTitle,
  WIND_RING_R,
  PIN_CX,
  PIN_CY,
  MARKER_VIEWBOX_W,
  MARKER_VIEWBOX_H,
} from '../mapWindArrow';

describe('wind ring marker', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(270)).toBe(90);
  });

  it('north wind arc spans around blow azimuth', () => {
    const blow = 180;
    const span = 70;
    const arc = describeWindRingArc(blow, span, PIN_CX, PIN_CY, WIND_RING_R);
    expect(arc).toMatch(/^M [\d.]+ [\d.]+ A /);
    const start = polarOnCircle(PIN_CX, PIN_CY, WIND_RING_R, blow - span / 2);
    const end = polarOnCircle(PIN_CX, PIN_CY, WIND_RING_R, blow + span / 2);
    expect(start.y).toBeGreaterThan(PIN_CY);
    expect(end.y).toBeGreaterThan(PIN_CY);
    expect(arc).toContain(start.x.toFixed(2));
    expect(arc).toContain(end.x.toFixed(2));
  });

  it('arc span tiers encode force not opacity', () => {
    expect(windRingArcSpanDegrees(4)).toBe(40);
    expect(windRingArcSpanDegrees(8)).toBe(70);
    expect(windRingArcSpanDegrees(12)).toBe(70);
    expect(windRingArcSpanDegrees(19)).toBe(100);
  });

  it('windDir relation mapping for west-facing coast', () => {
    expect(windRingRelation(90, 270)).toBe('offshore');
    expect(windRingRelation(270, 270)).toBe('onshore');
    expect(windRingRelation(0, 270)).toBe('cross');
    expect(windRingRelationClass('offshore')).toBe('ventu-wind-ring--offshore');
    expect(windRingRelationClass('onshore')).toBe('ventu-wind-ring--onshore');
    expect(windRingRelationClass('cross')).toBe('ventu-wind-ring--cross');
  });

  it('tip points along blow vector', () => {
    const { uy } = blowUnitVector(180);
    expect(uy).toBeGreaterThan(0);
    const tip = windRingTipPolygon(180);
    expect(tip).toContain(' Z');
  });

  it('marker svg uses wind ring + pin without external arrow', () => {
    const svg = buildWindRingMarkerSvg(78, 'rgb(16,185,129)', 270, 18, true, 270);
    expect(svg).toContain('ventu-wind-ring');
    expect(svg).toContain('ventu-wind-ring-arc');
    expect(svg).toContain('ventu-wind-ring--onshore');
    expect(svg).toContain('ventu-marker-pin');
    expect(svg).not.toContain('ventu-wind-wedge');
    expect(svg).not.toContain('ventu-wind-arrow');
    expect(svg).toContain(`viewBox="0 0 ${MARKER_VIEWBOX_W}`);
    expect(svg).toContain('>78<');
  });

  it('pin has no tail — dense clusters must not overlap tail triangles', () => {
    const svg = buildWindRingMarkerSvg(78, 'rgb(16,185,129)', 270, 18, false, 270);
    expect(svg).not.toContain('ventu-marker-drop-tail');
    // Only the two rim circles + score text inside the pin group — no <path>
    // (the tail used to be the only <path> in buildPinSvg).
    const pinGroup = svg.slice(svg.indexOf('ventu-marker-pin'));
    expect(pinGroup).not.toContain('<path');
  });

  it('icon anchor sits at the marker centre (no tail)', () => {
    const layout = markerIconLayout(true);
    expect(layout.iconAnchor).toEqual([MARKER_VIEWBOX_W / 2, MARKER_VIEWBOX_H / 2]);
    expect(layout.iconSize).toEqual([MARKER_VIEWBOX_W, MARKER_VIEWBOX_H]);
    expect(layout.popupAnchor[1]).toBeLessThan(-(MARKER_VIEWBOX_H / 2));
  });

  it('layout is identical with wind on or off — only the rim arc changes', () => {
    expect(markerIconLayout(true)).toEqual(markerIconLayout(false));
  });

  it('compact icon layout — no oversized compound marker', () => {
    const layout = markerIconLayout(true);
    expect(layout.iconSize[0]).toBeLessThanOrEqual(60);
    expect(layout.iconSize[1]).toBeLessThanOrEqual(60);
  });

  it('html title includes relation label', () => {
    const html = buildWindRingMarkerHtml(80, 'rgb(1,2,3)', 270, 12, true, 'pt', 270);
    expect(html).toContain('ventu-wind-ring-marker-wrap');
    expect(html).toContain('Onshore');
    expect(buildMapWindRingTitle(90, 14, 270, 'en')).toContain('Offshore');
  });
});
