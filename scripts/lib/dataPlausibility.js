/**
 * Plausibilidade numérica dos dados servidos (public/data) — guard de classe.
 *
 * Auditoria 2026-09-25: o `getDatawellData` do IH serve **99.99 como fill** para
 * amostras em falta/QC-rejeitadas. Essas linhas passaram a barreira do
 * `Number.isFinite` (o único filtro que existia), entraram no arquivo de skill
 * e envenenaram tudo o que deriva da série IH:
 *
 * - `forecast-skill.json`: RMSE IH global 6,88 m / corr 0,05 (o real, com o
 *   fill fora, é 0,37 m / corr 0,67) — 63 de 171 snapshots do monitor de
 *   regressão tinham RMSE entre 4,3 e 15,0 m;
 * - `wave-bias.json`: RMSE 10,1 m no BOND5 e 7,2 m no CSA94;
 * - `check-skill-regression.js`: duas «regressões do modelo» fantasma
 *   (CSA94 +2,89 m, BOND5 +0,89 m) que o validate-generated-data reportava;
 * - o `observedWave` de um spot ficaria a 99,99 m durante 3 h se o *latest* de
 *   uma boia fosse o fill (aí o score em tempo real ia atrás).
 *
 * O filtro na ingestão (scripts/lib/ihBuoys.js) e no cruzamento
 * (forecastSkill/skillRegression/buoyBias) fecha o caso concreto. Este guard é
 * a rede de classe: qualquer número servido com um nome conhecido e um valor
 * fisicamente impossível falha o passo de validação — em `update-data.yml`
 * (antes do push) e no job `quality` do CI — em vez de aparecer só no
 * dashboard daqui a um mês.
 *
 * Só compara chaves EXACTAS (nada de substrings): o objectivo é zero falsos
 * positivos. Uma chave desconhecida é ignorada, nunca adivinhada.
 */

/**
 * Intervalos fisicamente aceitáveis por chave (exacta).
 *
 * Fontes dos limites: altura significativa máxima medida ~19 m (recorde
 * mundial) → 25 m de folga; período de pico raramente > 25 s; vento máximo
 * registado em Portugal continental < 60 m/s → 80 m/s como tecto absoluto;
 * temperatura da água no Atlântico NE entre ~10 e ~28 °C → [-5, 40];
 * maré astronómica em PT bem dentro de ±5 m → ±15 m; score/confiança são 0–100.
 */
const RANGES = Object.freeze({
  waveHeight: [0, 25],
  waveHeightRaw: [0, 25],
  waveHeightObserved: [0, 25],
  swellHeight: [0, 25],
  swellHeightRaw: [0, 25],
  secondarySwellHeight: [0, 25],
  windWaveHeight: [0, 15],
  hm0: [0, 25],
  hmax: [0, 40],
  maxWaveHeight: [0, 40],
  wavePeriod: [0, 30],
  wavePeriodRaw: [0, 30],
  swellPeriod: [0, 30],
  windWavePeriod: [0, 20],
  tp: [0, 30],
  windSpeed: [0, 80],
  windGust: [0, 80],
  waterTemp: [-5, 40],
  seaSurfaceTemperature: [-5, 40],
  seaLevelHeightMsl: [-15, 15],
  tideHeight: [-15, 15],
  tideObservedHeight: [-15, 15],
  score: [0, 100],
  confidence: [0, 100],
});

/** Profundidade máxima de recursão (evita percursos patológicos). */
const MAX_DEPTH = 12;
/** Máximo de elementos de array visitados por nível (payloads grandes). */
const MAX_ARRAY = 5000;

/**
 * Procura valores numericamente implausíveis numa estrutura JSON.
 *
 * @param {unknown} root estrutura já parseada
 * @param {{ key: string, value: number, min: number, max: number }[]} [out] acumulador
 * @param {string} [path] caminho corrente (para a mensagem de erro)
 * @param {number} [depth]
 * @returns {{ key: string, value: number, min: number, max: number, path: string }[]}
 */
function findImplausibleValues(root, out = [], path = '', depth = 0) {
  if (depth > MAX_DEPTH) return out;

  if (Array.isArray(root)) {
    const limit = Math.min(root.length, MAX_ARRAY);
    for (let i = 0; i < limit; i++) {
      findImplausibleValues(root[i], out, `${path}[]`, depth + 1);
    }
    return out;
  }

  if (root === null || typeof root !== 'object') return out;

  for (const [key, value] of Object.entries(root)) {
    const childPath = path ? `${path}/${key}` : key;
    const range = RANGES[key];
    if (range && typeof value === 'number' && Number.isFinite(value)) {
      const [min, max] = range;
      if (value < min || value > max) {
        out.push({ key, value, min, max, path: childPath });
      }
      continue;
    }
    findImplausibleValues(value, out, childPath, depth + 1);
  }

  return out;
}

/**
 * Formata as violações numa linha por chave (a mensagem vai para o validador).
 * @param {{ key: string, value: number, min: number, max: number, path: string }[]} violations
 * @param {number} [maxExamples] exemplos a mostrar por chave
 * @returns {string[]}
 */
function formatViolations(violations, maxExamples = 3) {
  const byKey = new Map();
  for (const v of violations) {
    if (!byKey.has(v.key)) byKey.set(v.key, []);
    byKey.get(v.key).push(v);
  }
  const lines = [];
  for (const [key, list] of byKey) {
    const { min, max } = list[0];
    const examples = list
      .slice(0, maxExamples)
      .map((v) => `${v.path}=${v.value}`)
      .join(', ');
    lines.push(
      `${list.length} valor(es) fora de [${min}, ${max}] em "${key}" (ex.: ${examples})`,
    );
  }
  return lines;
}

module.exports = { RANGES, findImplausibleValues, formatViolations, MAX_DEPTH, MAX_ARRAY };
