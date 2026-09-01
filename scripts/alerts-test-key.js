/**
 * alerts:test-key — diagnóstico do token MeteoAlarm + verificação hermética da
 * cadeia de avisos num único comando.
 *
 *   npm run alerts:test-key                  # key check + cadeia de avisos
 *
 * 1. Diagnóstico REAL (scripts/test-meteoalarm-api-key.js, rede) com o token —
 *    valida a query EDR (Bearer), o parse do CAP Oasis 1.2 e o
 *    buildMeteoAlarmPayload sobre os spots reais; exit 0 = PASS, exit 1 = FAIL
 *    (sem token ou token rejeitado).
 * 2. Só se o diagnóstico sair 0, corre a verificação HERMÉTICA da cadeia
 *    MeteoAlarm→warnings (meteoalarmChainE2E.test.js, sem rede): com fetch
 *    mockado, o buildMeteoAlarmPayload produz um payload source:'meteoalarm'
 *    sobre os spots reais que o verify gate (verify-meteoalarm-warnings) aceita;
 *    o negativo prova que o gate apanha um fallback meteoalarm vazio.
 *
 * Sem token (ou com token rejeitado) o passo 1 falha cedo (exit 1) e a cadeia
 * nunca chega a correr — o comando falha rápido em vez de dar falso PASS.
 * Espelha o buoys-test-key.js.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const node = process.execPath;

const keyCheck = spawnSync(
  node,
  [path.join(__dirname, 'test-meteoalarm-api-key.js')],
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
    path.join(__dirname, 'lib', '__tests__', 'meteoalarmChainE2E.test.js'),
  ],
  { stdio: 'inherit' },
);
process.exit(chainCheck.status ?? 1);