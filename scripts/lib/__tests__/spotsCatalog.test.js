import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { loadSpotsCatalog, loadConditionsSpots } = require('../spotsCatalog.js');
const { render } = require('../../build-spots-catalog.js');

describe('spots catalog (src/lib/spots.json)', () => {
  it('carrega ≥50 spots com id/lat/lon válidos e ids únicos', () => {
    const spots = loadSpotsCatalog();
    expect(spots.length).toBeGreaterThanOrEqual(50);
    const ids = new Set(spots.map((s) => s.id));
    expect(ids.size).toBe(spots.length);
    for (const s of spots) {
      expect(typeof s.id).toBe('string');
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lon)).toBe(true);
    }
  });

  it('loadConditionsSpots devolve a forma que o pipeline usava (id/lat/lon/region/conditionsSource)', () => {
    const spots = loadConditionsSpots();
    const nazare = spots.find((s) => s.id === 'nazare');
    expect(nazare?.region).toBe('Oeste');
    const aliases = spots.filter((s) => s.conditionsSource);
    expect(aliases.map((a) => a.id).sort()).toEqual(['foz-arelho', 'obidos-lagoon-sul']);
  });

  it('src/lib/spots.ts está em sincronia com o catálogo (drift gate)', () => {
    const spotsTs = fs.readFileSync(
      path.join(__dirname, '../../../src/lib/spots.ts'),
      'utf8',
    );
    expect(spotsTs).toBe(render(loadSpotsCatalog()));
  });
});
