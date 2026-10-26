/**
 * forecastsIndex — o índice `{ [id]: linhas }` montado de forecasts/<id>.json,
 * que substituiu o agregado forecasts.json (deixou de ser publicado a
 * 25/10/2026).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { readForecastsIndex, listForecastIds } = require('../forecastsIndex.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fcidx-'));
const write = (dir, rel, obj) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), JSON.stringify(obj));
};

describe('readForecastsIndex', () => {
  it('monta o índice dos ficheiros por spot, por ordem alfabética', () => {
    const dir = tmp();
    write(dir, 'forecasts/nazare.json', [{ time: 'b' }]);
    write(dir, 'forecasts/guincho.json', [{ time: 'a' }]);
    fs.writeFileSync(path.join(dir, 'forecasts', 'notas.txt'), 'x');
    const idx = readForecastsIndex(dir);
    expect(Object.keys(idx)).toEqual(['guincho', 'nazare']);
    expect(idx.guincho).toEqual([{ time: 'a' }]);
    expect(listForecastIds(dir)).toEqual(['guincho', 'nazare']);
  });

  it('com a pasta presente, um forecasts.json velho no disco é ignorado', () => {
    const dir = tmp();
    write(dir, 'forecasts/guincho.json', [{ time: 'novo' }]);
    write(dir, 'forecasts.json', { guincho: [{ time: 'velho' }], fantasma: [] });
    expect(readForecastsIndex(dir)).toEqual({ guincho: [{ time: 'novo' }] });
  });

  it('sem pasta cai no agregado legado (fixtures antigas); sem nada devolve null', () => {
    const dir = tmp();
    expect(readForecastsIndex(dir)).toBeNull();
    expect(listForecastIds(dir)).toBeNull();
    write(dir, 'forecasts.json', { guincho: [{ time: 'x' }] });
    expect(readForecastsIndex(dir)).toEqual({ guincho: [{ time: 'x' }] });
  });

  it('o índice dos dados reais é igual ao agregado que existia (mesmo conteúdo por spot)', () => {
    const dir = tmp();
    const agregado = { b: [{ time: '1', waveHeight: 1 }], a: [{ time: '2', waveHeight: null }] };
    for (const [id, rows] of Object.entries(agregado)) write(dir, `forecasts/${id}.json`, rows);
    const idx = readForecastsIndex(dir);
    for (const id of Object.keys(agregado)) expect(idx[id]).toEqual(agregado[id]);
    expect(Object.keys(idx).sort()).toEqual(Object.keys(agregado).sort());
  });
});
