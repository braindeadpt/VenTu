/**
 * nhcStorms — parsing/normalização/scope do pipeline NHC (B0).
 * Sem rede: fixtures inline reproduzem o shape real de CurrentStorms.json
 * e de um KML de track+cone do NHC.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const zlib = require('zlib');
const {
  REGION,
  unzipKmz,
  parseKmlPlacemarks,
  simplifyRing,
  pointInRing,
  ringTouchesRegion,
  normalizeStorm,
  stormInScope,
  buildSpotStorms,
  buildStormsPayload,
} = require('../nhcStorms.js');

/** Zip mínimo válido (local header + central dir + EOCD) com um ficheiro. */
function makeZip(name, content, method = 8) {
  const data = Buffer.from(content, 'utf8');
  const comp = method === 8 ? zlib.deflateRawSync(data) : data;
  const nameBuf = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(method, 10);
  cd.writeUInt32LE(0, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42); // local offset

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nameBuf.length, 12);
  eocd.writeUInt32LE(30 + nameBuf.length + comp.length, 16);

  return Buffer.concat([local, nameBuf, comp, cd, nameBuf, eocd]);
}

const KML_TRACK = `<?xml version="1.0"?><kml><Document>
<Placemark><name>Forecast Track</name><LineString><coordinates>
-45.5,34.6,0 -44.0,35.0,0 -42.0,36.2,0
</coordinates></LineString></Placemark>
<Placemark><Point><coordinates>-44.0,35.0,0</coordinates></Point>
<description><![CDATA[<table><tr><td>12 hr Forecast</td></tr>
<tr><td>Valid at: 2026-09-30 00Z</td></tr>
<tr><td>Maximum Wind: 30 knots (35 mph)</td></tr></table>]]></description>
</Placemark>
</Document></kml>`;

const KML_CONE = `<?xml version="1.0"?><kml><Document>
<Placemark><name>Cone</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
-47,33,0 -44,32,0 -41,34,0 -43,37,0 -47,33,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;

const RAW_STORM = {
  id: 'al082026',
  binNumber: 'AT2',
  name: 'Hanna',
  classification: 'TS',
  intensity: 40,
  pressure: 1002,
  latitudeNumeric: 34.6,
  longitudeNumeric: -45.5,
  movementDir: 45,
  movementSpeed: 12,
  lastUpdate: '2026-09-29T15:00:00Z',
  forecastTrack: { advNum: '005', kmzFile: 'https://www.nhc.noaa.gov/x.kmz' },
  trackCone: { advNum: '005', kmzFile: 'https://www.nhc.noaa.gov/y.kmz' },
};

describe('unzipKmz', () => {
  it('extrai o XML de um KMZ deflate', () => {
    const kmz = makeZip('doc.kml', '<kml>ok</kml>');
    expect(unzipKmz(kmz)).toBe('<kml>ok</kml>');
  });

  it('extrai ficheiro stored (method 0)', () => {
    const kmz = makeZip('doc.kml', '<kml>stored</kml>', 0);
    expect(unzipKmz(kmz)).toBe('<kml>stored</kml>');
  });

  it('devolve null em buffers inválidos', () => {
    expect(unzipKmz(null)).toBeNull();
    expect(unzipKmz(Buffer.from('not a zip'))).toBeNull();
    expect(unzipKmz(Buffer.alloc(5))).toBeNull();
  });
});

describe('parseKmlPlacemarks', () => {
  it('extrai LineString + Points com forecastHr/validAt/maxWindMph', () => {
    const pms = parseKmlPlacemarks(KML_TRACK);
    const line = pms.find((p) => p.type === 'line');
    const pt = pms.find((p) => p.type === 'point');
    expect(line.coords).toEqual([[-45.5, 34.6], [-44, 35], [-42, 36.2]]);
    expect(pt.coords).toEqual([[-44, 35]]);
    expect(pt.forecastHr).toBe(12);
    expect(pt.validAt).toContain('2026-09-30');
    expect(pt.maxWindMph).toBe(35);
  });

  it('extrai o anel exterior do Polygon', () => {
    const pms = parseKmlPlacemarks(KML_CONE);
    const poly = pms.find((p) => p.type === 'polygon');
    expect(poly.coords.length).toBe(5);
    expect(poly.coords[0]).toEqual([-47, 33]);
  });

  it('ignora KML sem Placemark', () => {
    expect(parseKmlPlacemarks('<kml/>')).toEqual([]);
    expect(parseKmlPlacemarks(null)).toEqual([]);
  });
});

describe('normalizeStorm', () => {
  it('normaliza um registo real do CurrentStorms', () => {
    const s = normalizeStorm(RAW_STORM);
    expect(s.id).toBe('al082026');
    expect(s.name).toBe('Hanna');
    expect(s.classification).toBe('TS');
    expect(s.classificationLabel).toBe('Tempestade tropical');
    expect(s.intensityMph).toBe(40);
    expect(s.lat).toBe(34.6);
    expect(s.lon).toBe(-45.5);
    expect(s.movementDirDeg).toBe(45);
    expect(s.advisory).toBe('005');
    expect(s.trackKmz).toContain('x.kmz');
    expect(s.coneKmz).toContain('y.kmz');
  });

  it('classificação desconhecida → OTHER, nunca inventa', () => {
    expect(normalizeStorm({ ...RAW_STORM, classification: 'ZZ' }).classification).toBe('OTHER');
  });

  it('rejeita coordenadas inválidas', () => {
    expect(normalizeStorm({ ...RAW_STORM, latitudeNumeric: 'nope' })).toBeNull();
    expect(normalizeStorm(null)).toBeNull();
  });
});

describe('stormInScope', () => {
  it('centro dentro da região → inScope', () => {
    // Açores ~38N 28W está dentro de REGION
    expect(stormInScope({ lat: 38, lon: -28, cone: null }).inScope).toBe(true);
  });

  it('centro fora mas na margem (Cabo Verde) → inScope', () => {
    expect(stormInScope({ lat: 18, lon: -30, cone: null }).inScope).toBe(true);
  });

  it('centro muito fora sem cone → fora', () => {
    expect(stormInScope({ lat: 15, lon: -110, cone: null }).inScope).toBe(false);
    expect(stormInScope({ lat: 10, lon: -55, cone: null }).inScope).toBe(false);
  });

  it('centro fora da margem mas cone a tocar a região → inScope', () => {
    // Centro a -60 (fora de lonMin-8=-56) mas o cone estende-se até -40.
    const cone = [[-62, 30], [-40, 30], [-40, 38], [-62, 38], [-62, 30]];
    const r = stormInScope({ lat: 34, lon: -60, cone });
    expect(r.inScope).toBe(true);
    expect(r.coneTouches).toBe(true);
  });
});

describe('buildSpotStorms', () => {
  const storms = [
    {
      id: 'al01', name: 'Ana', classification: 'HU', classificationLabel: 'Furacão',
      lat: 36, lon: -30, movementDirDeg: 60, movementSpeedMph: 15,
      // Cone que cobre ponta-delgada (37.7, -25.7) aproximadamente
      cone: [[-32, 34], [-24, 34], [-24, 40], [-32, 40], [-32, 34]],
    },
  ];

  it('spot dentro do cone → strike com distância real', () => {
    const out = buildSpotStorms(storms, [{ id: 'ponta-delgada', lat: 37.7, lon: -25.7 }]);
    expect(out['ponta-delgada']).toHaveLength(1);
    expect(out['ponta-delgada'][0].centerDistKm).toBeGreaterThan(300);
    expect(out['ponta-delgada'][0].movementSpeedMph).toBe(15);
  });

  it('spot fora do cone → sem entrada', () => {
    const out = buildSpotStorms(storms, [{ id: 'carcavelos', lat: 38.7, lon: -9.3 }]);
    expect(out['carcavelos']).toBeUndefined();
  });

  it('tempestade sem cone nunca gera strike', () => {
    const out = buildSpotStorms(
      [{ ...storms[0], cone: null }],
      [{ id: 'ponta-delgada', lat: 37.7, lon: -25.7 }],
    );
    expect(out['ponta-delgada']).toBeUndefined();
  });
});

describe('simplifyRing / geometria', () => {
  it('reduz um anel grande mantendo endpoints', () => {
    const ring = [];
    for (let i = 0; i <= 500; i += 1) {
      const a = (i / 500) * Math.PI * 2;
      ring.push([Math.cos(a) * 5 - 30, Math.sin(a) * 3 + 37]);
    }
    const out = simplifyRing(ring, 0.05);
    expect(out.length).toBeLessThan(ring.length);
    expect(out.length).toBeGreaterThan(3);
    expect(out[0]).toEqual(out[out.length - 1]);
  });

  it('pointInRing / ringTouchesRegion básicos', () => {
    const sq = [[-10, 35], [-5, 35], [-5, 40], [-10, 40], [-10, 35]];
    expect(pointInRing(37, -7, sq)).toBe(true);
    expect(pointInRing(45, -7, sq)).toBe(false);
    expect(ringTouchesRegion(sq)).toBe(true);
    expect(ringTouchesRegion(sq, { ...REGION, lonMax: -12 })).toBe(false);
  });
});

describe('buildStormsPayload', () => {
  it('monta o shape do storms.json', () => {
    const p = buildStormsPayload(
      { activeStorms: [RAW_STORM, {}, {}] },
      [normalizeStorm(RAW_STORM)],
      [],
      '2026-09-29T15:00:00Z',
    );
    expect(p.source).toBe('nhc');
    expect(p.storms).toHaveLength(1);
    expect(p.activeCount).toBe(3);
    expect(p.region).toEqual(REGION);
    expect(p.spotStorms).toEqual({});
  });
});
