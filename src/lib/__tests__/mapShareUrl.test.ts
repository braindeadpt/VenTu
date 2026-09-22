import { describe, expect, it } from 'vitest';
import { buildMapShareSearch, buildMapShareUrl } from '../mapShareUrl';

describe('buildMapShareSearch', () => {
  it('escreve centro a 3 casas, desporto e camadas ligadas', () => {
    const qs = buildMapShareSearch({
      center: [39.60123, -9.07456],
      zoom: 11.34,
      sport: 'kitesurf',
      layers: { radar: true, buoys: true, sst: true, hs: false, currents: false },
    });
    const p = new URLSearchParams(qs);
    expect(p.get('lat')).toBe('39.601');
    expect(p.get('lon')).toBe('-9.075');
    expect(p.get('z')).toBe('11.3');
    expect(p.get('sport')).toBe('kitesurf');
    expect(p.get('radar')).toBe('1');
    expect(p.get('buoys')).toBe('1');
    expect(p.get('sst')).toBe('1');
    expect(p.get('hs')).toBeNull();
    expect(p.get('currents')).toBeNull();
    expect(p.get('isobaths')).toBeNull();
    expect(p.get('hours')).toBeNull();
  });

  it('omite região default e zoom ausente', () => {
    const qs = buildMapShareSearch({
      center: [38.0, -9.0],
      sport: 'all',
      region: 'Todos',
    });
    expect(qs).not.toContain('region=');
    expect(qs).not.toContain('z=');
    expect(qs).toContain('sport=all');
  });

  it('inclui região não-default codificada', () => {
    const qs = buildMapShareSearch({
      center: [38.0, -9.0],
      sport: 'surf',
      region: 'Viana do Castelo',
    });
    const p = new URLSearchParams(qs);
    expect(p.get('region')).toBe('Viana do Castelo');
  });
});

describe('buildMapShareUrl', () => {
  it('junta a base com a query', () => {
    const url = buildMapShareUrl('https://ventu.surf/pt/mapa/', {
      center: [38.7, -9.4],
      sport: 'surf',
      layers: { isobaths: true },
    });
    expect(url).toContain('https://ventu.surf/pt/mapa/?');
    expect(url).toContain('lat=38.700');
    expect(url).toContain('isobaths=1');
  });
});
