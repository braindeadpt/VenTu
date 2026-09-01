import { describe, it, expect } from 'vitest';
import {
  waveCardAttributionExpectation,
  basemapAttributionExpectation,
  waveSourceAttributionId,
  windSourceAttributionId,
  windCardAttributionExpectation,
} from '@/lib/dataSources';

/**
 * Auditoria dinâmica das cadeias de atribuição — os pares present/absent que a
 * UI deve mostrar/hide por superfície, derivados dos metadados da observação
 * (onda) e do modo do basemap (mapa). Estes helpers alimentam os testes e2e
 * para que a nota nunca diverja da fonte verdadeiramente exibida.
 */
describe('waveCardAttributionExpectation — nota corresponde à fonte exibida', () => {
  it('leitura IH → presente [ih], ausente [copernicus]', () => {
    expect(waveCardAttributionExpectation('ih-buoy')).toEqual({
      present: ['ih'],
      absent: ['copernicus'],
    });
  });

  it('leitura WMO/Copernicus → presente [copernicus], ausente [ih]', () => {
    expect(waveCardAttributionExpectation('wmo-buoy')).toEqual({
      present: ['copernicus'],
      absent: ['ih'],
    });
  });

  it('waveSourceAttributionId é a raiz da derivação', () => {
    expect(waveSourceAttributionId('ih-buoy')).toBe('ih');
    expect(waveSourceAttributionId('wmo-buoy')).toBe('copernicus');
    // waveCardAttributionExpectation reutiliza-o (uma só fonte de verdade).
    expect(waveCardAttributionExpectation('wmo-buoy').present[0]).toBe(
      waveSourceAttributionId('wmo-buoy'),
    );
  });
});

describe('basemapAttributionExpectation — Esri só no satélite', () => {
  it('modo mapa → presente [osm], ausente [esri]', () => {
    expect(basemapAttributionExpectation('map')).toEqual({
      present: ['osm'],
      absent: ['esri'],
    });
  });

  it('modo satélite → presente [esri], ausente [osm]', () => {
    expect(basemapAttributionExpectation('satellite')).toEqual({
      present: ['esri'],
      absent: ['osm'],
    });
  });

  it('os dois modos são mutuamente exclusivos (nunca Esri e OSM juntas)', () => {
    const map = basemapAttributionExpectation('map');
    const sat = basemapAttributionExpectation('satellite');
    expect(map.present[0]).toBe(sat.absent[0]);
    expect(sat.present[0]).toBe(map.absent[0]);
  });
});

describe('windCardAttributionExpectation — nota corresponde à estação exibida', () => {
  it('METAR obs → presente [metar], ausentes [ipma, ecowitt]', () => {
    expect(windCardAttributionExpectation('metar')).toEqual({
      present: ['metar'],
      absent: ['ipma', 'ecowitt'],
    });
  });

  it('Ecowitt obs → presente [ecowitt], ausentes [ipma, metar]', () => {
    expect(windCardAttributionExpectation('ecowitt')).toEqual({
      present: ['ecowitt'],
      absent: ['ipma', 'metar'],
    });
  });

  it('IPMA obs → presente [ipma], ausentes [ecowitt, metar]', () => {
    expect(windCardAttributionExpectation('ipma')).toEqual({
      present: ['ipma'],
      absent: ['ecowitt', 'metar'],
    });
  });

  it('só previsão → presente [open-meteo], ausentes as três estações', () => {
    expect(windCardAttributionExpectation('forecast')).toEqual({
      present: ['open-meteo'],
      absent: ['ipma', 'ecowitt', 'metar'],
    });
  });

  it('windSourceAttributionId é a raiz da derivação (obs real → estação certa)', () => {
    expect(windSourceAttributionId('metar')).toBe('metar');
    expect(windSourceAttributionId('ecowitt')).toBe('ecowitt');
    expect(windSourceAttributionId('ipma')).toBe('ipma');
    // A derive cobre os três e só esses três; um valor estranho degrada a open-meteo.
    expect(windSourceAttributionId('hologram')).toBe('open-meteo');
    expect(windCardAttributionExpectation('metar').present[0]).toBe(
      windSourceAttributionId('metar'),
    );
  });
});