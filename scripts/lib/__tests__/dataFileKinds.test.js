import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { BINARY_EXT, isBinaryDataRel } = require('../dataFileKinds.js');

describe('isBinaryDataRel (validate-data-files skip list)', () => {
  it('trata frames de radar PNG como binários', () => {
    expect(isBinaryDataRel('radar/frames/pcr-2026-08-31T2110.png')).toBe(true);
    expect(isBinaryDataRel('radar/ipma-radar.png')).toBe(true);
    expect(isBinaryDataRel('RADAR/IPMA-RADAR.PNG')).toBe(true);
  });

  it('não salta JSON / markdown / texto', () => {
    expect(isBinaryDataRel('forecasts.json')).toBe(false);
    expect(isBinaryDataRel('pipeline-meta.json')).toBe(false);
    expect(isBinaryDataRel('news.json.backup')).toBe(false);
    expect(isBinaryDataRel('README.md')).toBe(false);
  });

  it('cobre as extensões de imagem/fonte usadas sob public/data', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff2']) {
      expect(BINARY_EXT.has(ext)).toBe(true);
      expect(isBinaryDataRel(`x${ext}`)).toBe(true);
    }
  });
});
