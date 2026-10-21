import { describe, expect, it } from 'vitest';
import { loadSpotListings } from '../load-spot-data';
import { parseSpotListings, serializeSpotListings } from '../spotListingsJson';

/**
 * TBT /mapa: a listagem passa como string JSON nas props do RSC. A ida e
 * volta tem de devolver exactamente os mesmos dados que o React Flight
 * entregava como objectos — um NaN/Infinity (JSON → null), uma Date
 * (→ string) ou um Map (→ {}) apareceriam aqui como diferença.
 */
describe('serializeSpotListings / parseSpotListings', () => {
  it('ida e volta sem perdas sobre os dados reais do build', () => {
    const rows = loadSpotListings();
    expect(rows.length).toBeGreaterThan(100);
    const back = parseSpotListings<(typeof rows)[number]>(serializeSpotListings(rows));
    expect(back).toEqual(rows);
  });

  it('ida e volta preserva a ordem e os campos de cada linha', () => {
    const rows = loadSpotListings();
    const back = parseSpotListings<(typeof rows)[number]>(serializeSpotListings(rows));
    expect(back.map((r) => r.spot.id)).toEqual(rows.map((r) => r.spot.id));
    const first = rows[0] as unknown as Record<string, unknown>;
    expect(Object.keys(back[0])).toEqual(Object.keys(first).filter((k) => first[k] !== undefined));
  });
});
