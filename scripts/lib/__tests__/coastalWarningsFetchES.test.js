/**
 * fetch-ih-coastal-warnings.js — estado da fonte ES (esHealth) no output.
 *
 * O fetch grava `esHealth` (configured/status/erro/timestamps) e um
 * `esSourceNote` dinâmico — o health-check lê-os do pipeline-meta para avisar
 * quando ES_NAV_WARNINGS_URL está configurada mas o feed devolve erros
 * repetidos. Este spec corre o módulo real (guard require.main → sem CLI) com
 * fetch stubado e paths env-overridable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', '..', 'fetch-ih-coastal-warnings.js'),
).href;

const IH_COLLECTION_URL = 'https://api-features.hidrografico.pt/collections/nav_warning_coastal/items?limit=200&f=json';

function makeStubFetch(esImpl) {
  return async (url) => {
    if (typeof url === 'string' && url.includes('/collections/nav_warning_coastal/items')) {
      return { ok: true, json: async () => ({ features: [] }) };
    }
    return esImpl(url);
  };
}

async function loadFetchModule(env) {
  vi.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coast-es-'));
  const output = path.join(dir, 'out.json');
  const archive = path.join(dir, 'archive.json');
  // O módulo lê o env no require — setar ANTES do import dinâmico.
  process.env.IH_COASTAL_WARNINGS_OUTPUT_PATH = output;
  process.env.IH_COASTAL_WARNINGS_ARCHIVE_PATH = archive;
  if (env.ES_NAV_WARNINGS_URL !== undefined) process.env.ES_NAV_WARNINGS_URL = env.ES_NAV_WARNINGS_URL;
  else delete process.env.ES_NAV_WARNINGS_URL;
  const { fetchCoastalWarningsData } = await import(MODULE_URL);
  vi.stubGlobal('fetch', makeStubFetch(env.__esImpl));
  return { fetchCoastalWarningsData, output, archive };
}

function readOutput(output) {
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ES_NAV_WARNINGS_URL;
  delete process.env.IH_COASTAL_WARNINGS_OUTPUT_PATH;
  delete process.env.IH_COASTAL_WARNINGS_ARCHIVE_PATH;
});

describe('fetch-ih-coastal-warnings — esHealth', () => {
  it('ES_NAV_WARNINGS_URL configurada + feed ok → esHealth ok + es preenchido', async () => {
    const esOk = async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { id: 7, ref: 'AVISO ES 7/26', category: 'Ejercicio naval' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-8.9, 41.9], [-8.7, 42.0], [-8.8, 42.1], [-8.9, 41.9]]],
            },
          },
        ],
      }),
    });
    const { fetchCoastalWarningsData, output } = await loadFetchModule({
      ES_NAV_WARNINGS_URL: 'https://es.example.invalid/feed.json',
      __esImpl: esOk,
    });
    await fetchCoastalWarningsData();
    const data = readOutput(output);
    expect(data.es).toHaveLength(1);
    expect(data.es[0].source).toBe('es');
    expect(data.esHealth.configured).toBe(true);
    expect(data.esHealth.status).toBe('ok');
    expect(data.esHealth.lastOkAt).toBeTruthy();
    expect(data.esSourceNote).toContain('fonte espanhola cross-border');
  });

  it('ES_NAV_WARNINGS_URL configurada + feed em erro → esHealth error + esSourceNote marca degradação', async () => {
    const esFail = async () => {
      throw new Error('HTTP 403');
    };
    const { fetchCoastalWarningsData, output } = await loadFetchModule({
      ES_NAV_WARNINGS_URL: 'https://es.example.invalid/feed.json',
      __esImpl: esFail,
    });
    await fetchCoastalWarningsData();
    const data = readOutput(output);
    expect(data.es).toHaveLength(0);
    expect(data.esHealth.configured).toBe(true);
    expect(data.esHealth.status).toBe('error');
    expect(data.esHealth.error).toContain('403');
    expect(data.esHealth.lastErrorAt).toBeTruthy();
    expect(data.esSourceNote).toMatch(/feed ES em ERRO/i);
  });

  it('sem ES_NAV_WARNINGS_URL → esHealth disabled + es:[] + nota padrão', async () => {
    const { fetchCoastalWarningsData, output } = await loadFetchModule({});
    await fetchCoastalWarningsData();
    const data = readOutput(output);
    expect(data.es).toHaveLength(0);
    expect(data.esHealth.configured).toBe(false);
    expect(data.esHealth.status).toBe('disabled');
    expect(data.esSourceNote).toContain('Sem feed ES configurado');
  });
});