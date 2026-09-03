import { describe, expect, it } from 'vitest';
import {
  BUOY_READING_MAX_AGE_HOURS,
  WMO_READING_MAX_AGE_HOURS,
} from '@/lib/buoyLayerHealth';
import {
  buoyDotHtml,
  buoyPopupHtml,
  collectMapBuoyDots,
  formatBuoyClock,
  isFreshBuoyReading,
  isInactiveBuoyStatus,
  type MapBuoyIhFile,
  type MapBuoyWmoFile,
} from '@/lib/mapBuoyDots';

const NOW = Date.parse('2026-09-03T14:00:00Z');

function isoHoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

const ihLeixoes = {
  idEst: 4,
  name: 'CSA92/D',
  area: 'Leixões',
  lat: 41.3156,
  lon: -8.9825,
  status: 'active',
  wmoId: 6201077,
  latest: { date: isoHoursAgo(0.5), hm0: 1.4 },
};

describe('isInactiveBuoyStatus', () => {
  it('inactive / inativa', () => {
    expect(isInactiveBuoyStatus('inactive')).toBe(true);
    expect(isInactiveBuoyStatus('inativa')).toBe(true);
    expect(isInactiveBuoyStatus('active')).toBe(false);
  });
});

describe('isFreshBuoyReading', () => {
  it('IH 3 h gate', () => {
    expect(isFreshBuoyReading(isoHoursAgo(2.9), BUOY_READING_MAX_AGE_HOURS, NOW)).toBe(true);
    expect(isFreshBuoyReading(isoHoursAgo(3.1), BUOY_READING_MAX_AGE_HOURS, NOW)).toBe(false);
  });

  it('WMO 6 h gate', () => {
    expect(isFreshBuoyReading(isoHoursAgo(5), WMO_READING_MAX_AGE_HOURS, NOW)).toBe(true);
    expect(isFreshBuoyReading(isoHoursAgo(7), WMO_READING_MAX_AGE_HOURS, NOW)).toBe(false);
  });
});

describe('collectMapBuoyDots', () => {
  it('IH fresco com hm0; inactiva ignorada; area ganha ao código da estação', () => {
    const ih: MapBuoyIhFile = {
      stations: {
        '4': ihLeixoes,
        '1': {
          idEst: 1,
          name: 'Nazaré Oceânica',
          lat: 39.5,
          lon: -9.8,
          status: 'inactive',
          latest: { date: isoHoursAgo(24), hm0: 3 },
        },
      },
    };
    const dots = collectMapBuoyDots(ih, null, NOW);
    expect(dots).toHaveLength(1);
    expect(dots[0]).toMatchObject({
      id: 'ih-4',
      name: 'Leixões',
      hs: 1.4,
      fresh: true,
      source: 'ih',
    });
  });

  it('IH >3 h → ponto morto (fresh false), ainda no mapa', () => {
    const ih: MapBuoyIhFile = {
      stations: {
        '4': { ...ihLeixoes, latest: { date: isoHoursAgo(5), hm0: 1.1 } },
      },
    };
    const [dot] = collectMapBuoyDots(ih, null, NOW);
    expect(dot.fresh).toBe(false);
    expect(dot.hs).toBe(1.1);
  });

  it('WMO 5 h ainda fresco; clone IH por wmoId ignorado', () => {
    const ih: MapBuoyIhFile = { stations: { '4': ihLeixoes } };
    const wmo: MapBuoyWmoFile = {
      buoys: {
        '6201077': {
          code: '6201077',
          name: 'Porto',
          lat: 41.3156,
          lon: -8.9825,
          latest: { date: isoHoursAgo(1), hs: 1.5 },
        },
        '6200084': {
          code: '6200084',
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          latest: { date: isoHoursAgo(5), hs: 2.1 },
        },
      },
    };
    const dots = collectMapBuoyDots(ih, wmo, NOW);
    expect(dots.map((d) => d.id).sort()).toEqual(['ih-4', 'wmo-6200084']);
    const silleiro = dots.find((d) => d.id === 'wmo-6200084')!;
    expect(silleiro.fresh).toBe(true);
    expect(silleiro.hs).toBe(2.1);
  });

  it('WMO >6 h → morto; clone por proximidade sem wmoId também cai', () => {
    const ih: MapBuoyIhFile = {
      stations: {
        '4': { ...ihLeixoes, wmoId: undefined },
      },
    };
    const wmo: MapBuoyWmoFile = {
      buoys: {
        '6201077': {
          code: '6201077',
          name: 'Porto',
          lat: 41.3157,
          lon: -8.9824,
          latest: { date: isoHoursAgo(1), hs: 1.5 },
        },
        '6200084': {
          code: '6200084',
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          latest: { date: isoHoursAgo(12), hs: 2.1 },
        },
      },
    };
    const dots = collectMapBuoyDots(ih, wmo, NOW);
    expect(dots.map((d) => d.id).sort()).toEqual(['ih-4', 'wmo-6200084']);
    expect(dots.find((d) => d.id === 'wmo-6200084')!.fresh).toBe(false);
  });

  it('sem coords ou sem Hs → skip', () => {
    const ih: MapBuoyIhFile = {
      stations: {
        a: { name: 'Sem sítio', status: 'active', latest: { date: isoHoursAgo(1), hm0: 1 } },
        b: {
          name: 'Sem Hs',
          lat: 41,
          lon: -9,
          status: 'active',
          latest: { date: isoHoursAgo(1) },
        },
      },
    };
    expect(collectMapBuoyDots(ih, null, NOW)).toEqual([]);
  });
});

describe('buoyPopupHtml', () => {
  it('escape + Hs mono + fonte IH', () => {
    const html = buoyPopupHtml(
      {
        id: 'ih-4',
        name: 'Leixões <x>',
        lat: 41,
        lon: -9,
        hs: 1.4,
        observedAt: '2026-09-03T13:00:00Z',
        fresh: true,
        source: 'ih',
      },
      {
        hs: 'Hs',
        stale: 'Leitura antiga',
        sourceIh: 'Instituto Hidrográfico',
        sourceWmo: 'Copernicus',
        noHs: 'Sem Hs',
      },
    );
    expect(html).toContain('Leixões &lt;x&gt;');
    expect(html).toContain('1.4 m');
    expect(html).toContain('Instituto Hidrográfico');
    expect(html).not.toContain('Leitura antiga');
  });
});

describe('buoyDotHtml', () => {
  it('pinta o Hs no ponto para o anel não desaparecer no mapa', () => {
    const html = buoyDotHtml({
      id: 'ih-4',
      name: 'Leixões',
      lat: 41,
      lon: -9,
      hs: 1.4,
      observedAt: null,
      fresh: false,
      source: 'ih',
    });
    expect(html).toContain('data-buoy-id="ih-4"');
    expect(html).toContain('data-buoy-fresh="false"');
    expect(html).toContain('ventu-buoy-hs');
    expect(html).toContain('1.4');
  });
});

describe('formatBuoyClock', () => {
  it('hora de Lisboa', () => {
    expect(formatBuoyClock('2026-09-03T14:00:00+01:00')).toMatch(/14h/);
  });
});
