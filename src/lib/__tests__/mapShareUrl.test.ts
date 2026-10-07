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
    expect(p.get('nauticalChart')).toBeNull();
    expect(p.get('hours')).toBeNull();
  });

  it('serializa todas as camadas do contrato + basemap satélite', () => {
    const qs = buildMapShareSearch({
      center: [38.7, -9.4],
      sport: 'surf',
      basemap: 'satellite',
      layers: {
        wind: true, nauticalChart: true,
        goesIr: true, storms: true, warnAreas: true, coastalWarnings: true,
      },
    });
    const p = new URLSearchParams(qs);
    for (const k of ['wind', 'nauticalChart', 'goesIr', 'storms', 'warnAreas', 'coastalWarnings']) {
      expect(p.get(k), k).toBe('1');
    }
    expect(p.get('basemap')).toBe('sat');
  });

  it('omite basemap «mapa» (default) e camadas desligadas', () => {
    const qs = buildMapShareSearch({
      center: [38.7, -9.4],
      sport: 'surf',
      basemap: 'map',
      layers: { storms: false, goesIr: true },
    });
    expect(qs).not.toContain('basemap=');
    expect(qs).not.toContain('storms=');
    expect(qs).toContain('goesIr=1');
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
      layers: { nauticalChart: true },
    });
    expect(url).toContain('https://ventu.surf/pt/mapa/?');
    expect(url).toContain('lat=38.700');
    expect(url).toContain('nauticalChart=1');
  });
});

describe('camada «Ondulação» no URL', () => {
  it('a partilha escreve swell=1', async () => {
    const { buildMapShareSearch } = await import('../mapShareUrl');
    const p = new URLSearchParams(
      buildMapShareSearch({ center: [39, -9], sport: 'surf', layers: { swell: true, wind: true } }),
    );
    expect(p.get('swell')).toBe('1');
    expect(p.get('wind')).toBe('1');
  });

  it('mergeMapLayerParam liga/desliga sem tocar nos outros params', async () => {
    const { mergeMapLayerParam } = await import('../mapShareUrl');
    expect(mergeMapLayerParam('?sport=surf&lat=39&radar=1', 'swell', true)).toBe('?sport=surf&lat=39&radar=1&swell=1');
    expect(mergeMapLayerParam('?sport=surf&swell=1&z=9', 'swell', false)).toBe('?sport=surf&z=9');
    expect(mergeMapLayerParam('', 'swell', false)).toBe('');
    expect(mergeMapLayerParam('?swell=1', 'swell', true)).toBe('?swell=1');
  });
});
