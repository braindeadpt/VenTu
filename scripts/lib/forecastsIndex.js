/**
 * Índice das previsões horárias por spot, lido de public/data/forecasts/<id>.json.
 *
 * Até 25/10/2026 o pipeline escrevia também `public/data/forecasts.json` — o
 * mesmo conteúdo, indexado por spot (~11 MB), recommitado a cada corrida e a
 * comer um terço do orçamento de 32 MB de public/data. O cliente já só lia os
 * ficheiros por spot; os leitores do agregado (scripts e build) passaram a
 * montar o índice daqui. A pasta é a única fonte: `{ [id]: linhas }`, com as
 * chaves por ordem alfabética do nome do ficheiro.
 *
 * Compatibilidade: sem a pasta (fixtures antigas de testes, árvores de dados
 * soltas), cai no `forecasts.json` agregado se existir. Com a pasta presente o
 * agregado é ignorado — um ficheiro velho esquecido no disco nunca ganha.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Ids (nomes sem `.json`) dos ficheiros por spot, por ordem alfabética. */
function listForecastIds(dataDir) {
  const dir = path.join(dataDir, 'forecasts');
  if (!fs.existsSync(dir)) return null;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/**
 * @param {string} dataDir pasta de dados (normalmente public/data)
 * @returns {Record<string, Array<Record<string, unknown>>> | null} null quando
 *   não há pasta nem agregado
 */
function readForecastsIndex(dataDir) {
  const ids = listForecastIds(dataDir);
  if (ids && ids.length > 0) {
    const out = {};
    for (const id of ids) {
      out[id] = JSON.parse(fs.readFileSync(path.join(dataDir, 'forecasts', `${id}.json`), 'utf8'));
    }
    return out;
  }
  const legacy = path.join(dataDir, 'forecasts.json');
  if (fs.existsSync(legacy)) return JSON.parse(fs.readFileSync(legacy, 'utf8'));
  return null;
}

module.exports = { readForecastsIndex, listForecastIds };
