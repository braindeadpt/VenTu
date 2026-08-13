import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

// Receita do incidente 2026-08-13 (docs/BACKLOG.md "Marés"): quando o
// `tide_obs_nrt/items` devolve 500 (backend de observações em baixo), a mesma
// coleção expõe EDR `radius?coords=POINT(lon lat)&within=50000`. Este teste
// mocka o fetch e percorre o CAMINHO REAL do pipeline (fetchIHTides →
// fetchEDRRadius → stationFromFeature) com `IH_EDR_FALLBACK=1`, cobrindo a
// receita no CI permanentemente — sem depender do backend IH.
const MODULE_PATH = '../../fetch-ih-tides.js';

// Últimas estações conhecidas (marégrafos fixos) — o fixture simula o
// public/data/ih-tides.json anterior.
const STATIONS = [
  { codp: '1', title: 'Leixões', category: 'tide gauge', lat: 41.1833, lon: -8.7, lastObs: 2.14, lastData: '2026-08-13T09:00:00Z' },
  { codp: '2', title: 'Aveiro', category: 'tide gauge', lat: 40.65, lon: -8.75, lastObs: 1.9, lastData: '2026-08-13T09:00:00Z' },
  { codp: '3', title: 'Lisboa', category: 'tide gauge', lat: 38.7, lon: -9.15, lastObs: 2.5, lastData: '2026-08-13T09:00:00Z' },
  { codp: '4', title: 'Sines', category: 'tide gauge', lat: 37.95, lon: -8.87, lastObs: 1.7, lastData: '2026-08-13T09:00:00Z' },
];

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ih-tides-test-'));
  // Fixture "último ih-tides.json conhecido" — fresco, com as 4 estações.
  const stations = {};
  for (const s of STATIONS) {
    stations[s.codp] = {
      codp: s.codp, title: s.title, category: s.category,
      lat: s.lat, lon: s.lon, lastObs: s.lastObs, lastData: s.lastData,
    };
  }
  fs.writeFileSync(
    path.join(tmpDir, 'ih-tides.json'),
    JSON.stringify({ stations, fetchedAt: new Date().toISOString(), sourceCollection: 'tide_obs_nrt' }),
  );
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

/** Recarrega o módulo com o env pretendido (o env é lido no load).
 * Nota: `vi.resetModules()` NÃO limpa o cache CJS carregado via createRequire —
 * eliminar a entrada do require.cache é o que força o re-load com o env novo.
 */
function loadModule(overrides = {}) {
  process.env.IH_API_URL = 'http://mock-ih.local';
  process.env.IH_OUTPUT_PATH = path.join(tmpDir, 'ih-tides.json');
  process.env.IH_EDR_FALLBACK = '1';
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  const resolved = require.resolve(MODULE_PATH);
  delete require.cache[resolved];
  return require(resolved);
}

/** Instala o mock de fetch e devolve o spy (para contar chamadas). */
function installFetch(impl) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Feature EDR de uma estação; geometryOnly = sem p.lat/p.lon (só geometry). */
function featureFor(s, { geometryOnly = false } = {}) {
  const properties = {
    codp: s.codp, title: s.title, category: s.category,
    last_sea_surface_height: s.lastObs, last_date_time: s.lastData,
  };
  if (!geometryOnly) {
    properties.lat = s.lat;
    properties.lon = s.lon;
  }
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } };
}

/** Handles um pedido EDR radius: devolve as features da estação pedida. */
function radiusRequestHandler(url) {
  const decoded = decodeURIComponent(String(url));
  const m = decoded.match(/coords=POINT\(([-\d.]+) ([-\d.]+)\)/);
  const station = m && STATIONS.find((s) => s.lon === parseFloat(m[1]) && s.lat === parseFloat(m[2]));
  if (!station) return json({}, 500);
  // Círculos sobrepostos: o radius do 1 inclui o 2, o do 2 inclui o 3 →
  // o mesmo codp chega por 2 radius → a dedup na função principal é provada.
  if (station.codp === '1') return json({ type: 'FeatureCollection', features: [featureFor(STATIONS[0]), featureFor(STATIONS[1])] });
  if (station.codp === '2') return json({ type: 'FeatureCollection', features: [featureFor(STATIONS[1]), featureFor(STATIONS[2])] });
  if (station.codp === '3') return json({ type: 'FeatureCollection', features: [featureFor(STATIONS[2], { geometryOnly: true })] });
  return json({ type: 'FeatureCollection', features: [featureFor(STATIONS[3])] });
}

const radiusCalls = (mock) => mock.mock.calls.filter(([u]) => String(u).includes('/radius'));

describe('fetch-ih-tides EDR fallback (receita incidente IH 2026-08-13)', () => {
  it('edrRadiusUrl constrói WKT POINT(lon lat) com espaço (não vírgula)', () => {
    const { edrRadiusUrl, EDR_RADIUS_M } = loadModule();
    const url = edrRadiusUrl(38.7, -9.15);
    expect(url).toContain('/collections/tide_obs_nrt/radius?');
    expect(decodeURIComponent(url)).toContain('coords=POINT(-9.15 38.7)');
    expect(url).toContain(`within=${EDR_RADIUS_M}`);
    expect(url).toContain('f=json');
  });

  it('stationFromFeature normaliza schema novo+velho, null em incompletos e fallback de geometry', () => {
    const { stationFromFeature } = loadModule();
    // Schema novo (2026): last_sea_surface_height / last_date_time
    const fresh = stationFromFeature({
      properties: { codp: '7', title: 'X', last_sea_surface_height: 1.2, last_date_time: '2026-08-13T00:00:00Z', lat: 40, lon: -8 },
    });
    expect(fresh).toMatchObject({ codp: '7', lastObs: 1.2, lastData: '2026-08-13T00:00:00Z', lat: 40, lon: -8 });
    // Aliases do schema velho: last_obs / last_data
    const legacy = stationFromFeature({
      properties: { codp: '8', last_obs: 0.5, last_data: '2026-08-13T00:00:00Z', lat: 41, lon: -9 },
    });
    expect(legacy.lastObs).toBe(0.5);
    expect(legacy.lastData).toBe('2026-08-13T00:00:00Z');
    // Incompletos → null (nunca entram no output)
    expect(stationFromFeature({ properties: { codp: '9' } })).toBeNull();
    expect(stationFromFeature({ properties: {} })).toBeNull();
    // Features EDR podem só trazer a posição em geometry.coordinates [lon, lat]
    const geo = stationFromFeature({
      properties: { codp: '10', last_sea_surface_height: 1, last_date_time: '2026-08-13T00:00:00Z' },
      geometry: { type: 'Point', coordinates: [-9.4, 38.7] },
    });
    expect(geo.lon).toBe(-9.4);
    expect(geo.lat).toBe(38.7);
  });

  it('T2: items 500 + flag → fallback radius com dedup, geometry e source tide_obs_nrt/radius', async () => {
    const mod = loadModule();
    const fetchMock = installFetch(async (url) => {
      if (String(url).includes('/items')) return json({}, 500);
      if (String(url).includes('/radius')) return radiusRequestHandler(url);
      return json({}, 404);
    });

    const output = await mod.fetchIHTides();

    // Sample-probe (3) + fetch completo (4) — 7 pedidos radius, nunca items.
    expect(radiusCalls(fetchMock)).toHaveLength(3 + STATIONS.length);
    // Dedup: codp 2 e 3 chegam por 2 radius cada → só 4 estações únicas.
    expect(Object.keys(output.stations)).toHaveLength(STATIONS.length);
    expect(output.stations['2'].title).toBe('Aveiro');
    expect(output.stations['3'].title).toBe('Lisboa');
    // A estação 3 veio só com geometry.coordinates → lat/lon do fallback.
    expect(output.stations['3'].lat).toBe(38.7);
    expect(output.stations['3'].lon).toBe(-9.15);
    // Rastreabilidade: sourceCollection indica o caminho EDR usado.
    expect(output.sourceCollection).toBe('tide_obs_nrt/radius');
    // O output foi persistido no ficheiro (pipeline real escreve o JSON).
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ih-tides.json'), 'utf8'));
    expect(onDisk.stations).toEqual(output.stations);
    expect(onDisk.sourceCollection).toBe('tide_obs_nrt/radius');
  });

  it('T3: EDR também em baixo → só o sample-probe dispara (nunca o fetch completo)', async () => {
    const mod = loadModule();
    const fetchMock = installFetch(async () => json({}, 500));

    await expect(mod.fetchIHTides()).rejects.toThrow(/EDR radius probe failed for all sample stations/);
    // 3 estações sondadas; as 4 do fetch completo NUNCA são pedidas.
    expect(radiusCalls(fetchMock)).toHaveLength(3);
  });

  it('T4: flag off → o radius nunca é chamado (default OFF de propósito)', async () => {
    const mod = loadModule({ IH_EDR_FALLBACK: '0' });
    const fetchMock = installFetch(async () => json({}, 500));

    await expect(mod.fetchIHTides()).rejects.toThrow(/All IH tide collections failed/);
    expect(radiusCalls(fetchMock)).toHaveLength(0);
  });

  it('T5: sem ficheiro anterior → erro claro de coordenadas desconhecidas', async () => {
    const missing = path.join(tmpDir, 'never-exists', 'ih-tides.json');
    const mod = loadModule({ IH_OUTPUT_PATH: missing });
    const fetchMock = installFetch(async () => json({}, 500));

    await expect(mod.fetchIHTides()).rejects.toThrow(/no last-known station coordinates/);
    expect(radiusCalls(fetchMock)).toHaveLength(0);
  });

  it('staleness: ficheiro fresco é reutilizado (exit 0) e >24h falha alto (exit 1)', async () => {
    // Fresco → reuso silencioso, exit code intacto.
    const modFresh = loadModule();
    installFetch(async () => json({}, 500));
    await modFresh.run();
    expect(process.exitCode).toBeFalsy();

    // 30h → o guard MAX_STALE_HOURS falha alto (pedido explícito: nunca
    // publicar marés com dias de idade em silêncio).
    const stalePath = path.join(tmpDir, 'stale.json');
    const stale = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ih-tides.json'), 'utf8'));
    stale.fetchedAt = new Date(Date.now() - 30 * 3_600_000).toISOString();
    fs.writeFileSync(stalePath, JSON.stringify(stale));
    process.exitCode = undefined;

    const modStale = loadModule({ IH_OUTPUT_PATH: stalePath });
    installFetch(async () => json({}, 500));
    await modStale.run();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
