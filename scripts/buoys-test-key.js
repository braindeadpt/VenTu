/**
 * buoys:test-key — diagnóstico da IH_API_KEY + verificação da cadeia da Nazaré
 * num único comando.
 *
 *   npm run buoys:test-key                        # key check + cadeia Nazaré
 *   npm run buoys:test-key -- --family fugro      # key check só Fugro + cadeia
 *   npm run buoys:test-key -- --station 2         # key check só boia 2 + cadeia
 *
 * 1. Diagnóstico REAL (scripts/test-ih-api-key.js, rede) com os args passados
 *    (--family/--station/--url) — valida estações OGC + getDatawellData + parse
 *    + frescura; exit 0 = PASS, exit 1 = FAIL (sem key ou key rejeitada).
 * 2. Só se o diagnóstico sair 0, corre a verificação HERMÉTICA da cadeia
 *    Fugro→observedWave (observedWaveNazareE2E.test.js, sem rede): a fixture
 *    injecta a leitura fresca da boia 2 no ih-buoys.json e o merge real anexa
 *    o observedWave ao spot `nazare`.
 *
 * Sem key (ou com key rejeitada) o passo 1 falha cedo (exit 1) e a cadeia
 * nunca chega a correr — o comando falha rápido em vez de dar falso PASS.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const node = process.execPath;

const keyCheck = spawnSync(
  node,
  [path.join(__dirname, 'test-ih-api-key.js'), ...args],
  { stdio: 'inherit' },
);
if (keyCheck.status !== 0) {
  process.exit(keyCheck.status ?? 1);
}

const chainCheck = spawnSync(
  node,
  [
    path.join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    path.join(__dirname, 'lib', '__tests__', 'observedWaveNazareE2E.test.js'),
  ],
  { stdio: 'inherit' },
);
process.exit(chainCheck.status ?? 1);
