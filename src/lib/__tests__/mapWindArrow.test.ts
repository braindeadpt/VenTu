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
  MARKER_TAIL_TIP_Y,
  PIN_R,
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

  it('icon anchor sits on pin tail tip', () => {
    const layout = markerIconLayout(true);
    expect(MARKER_TAIL_TIP_Y).toBe(PIN_CY + PIN_R + 8);
    expect(MARKER_TAIL_TIP_Y).toBe(47);
    expect(layout.iconAnchor).toEqual([Math.round(MARKER_VIEWBOX_W / 2), MARKER_TAIL_TIP_Y]);
    expect(layout.iconSize[1]).toBe(MARKER_TAIL_TIP_Y);
    expect(layout.popupAnchor[1]).toBeLessThan(-MARKER_TAIL_TIP_Y);
  });

  it('compact icon layout — no oversized compound marker', () => {
    const withWind = markerIconLayout(true);
    expect(withWind.iconSize[0]).toBeLessThanOrEqual(56);
    expect(withWind.iconSize[1]).toBe(47);
    expect(markerIconLayout(false).iconSize).toEqual([34, 44]);
  });

  it('html title includes relation label', () => {
    const html = buildWindRingMarkerHtml(80, 'rgb(1,2,3)', 270, 12, true, 'pt', 270);
    expect(html).toContain('ventu-wind-ring-marker-wrap');
    expect(html).toContain('Onshore');
    expect(buildMapWindRingTitle(90, 14, 270, 'en')).toContain('Offshore');
  });
});
