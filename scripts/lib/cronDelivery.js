/**
 * Entrega nominal dos crons — runs observados vs esperados (secção E do
 * `scripts/ops-audit.js`).
 *
 * Porquê: o `schedule` do GitHub é best-effort. As medições de 21–24/09 e de
 * 25/09 mostram crons a entregar 2–23% do nominal (telegram-poll 2%,
 * staleness-alert 12%, data-cadence 12%, ih-health 22%) — e nada no repo via
 * isso: os heartbeats só olham para os DADOS (meta/commit), o `gh run list` da
 * secção B só vê o último run e se falhou. Um cron que entrega metade do que
 * agenda é uma perda silenciosa de vigilância: o monitor continua a existir,
 * mas só olha para a janela que o scheduler lhe der.
 *
 * O que mede: para cada workflow com `schedule:`, quantas vezes ele CORREU
 * (qualquer gatilho) contra as vezes que os seus `cron:` dizem que devia
 * correr. Conta qualquer gatilho de propósito: o objetivo é saber se o
 * workflow está vivo ao ritmo que promete, e um ping do keep-alive que o
 * acorde conta como entrega (é precisamente por isso que o keep-alive existe).
 * Quem quiser isolar a entrega do SCHEDULER filtra `event=schedule` à mão.
 *
 * Regra de decisão (única, para não haver dois juízos):
 *  - nominal >= 4 runs/dia → janela de 24 h (meio dia perdido é sinal);
 *  - nominal < 4 runs/dia (diário/semanal) → janela de 7 dias (num cron
 *    diário, 0 em 24 h é indistinguível de atraso do scheduler; numa semana
 *    já não é);
 *  - finding quando observado < metade do esperado na janela escolhida.
 *
 * As contagens observadas NÃO são medidas aqui (é I/O): o CLI passa-as. Isto
 * mantém o módulo puro e testável sem rede.
 */

/** A partir deste nominal diário julga-se na janela curta. */
const FAST_WINDOW_MIN_PER_DAY = 4;
/** Janelas, em horas. */
const WINDOW_HOURS_FAST = 24;
const WINDOW_HOURS_SLOW = 168;
/** Rácio abaixo do qual há finding (< metade). */
const BELOW_HALF_RATIO = 0.5;
/** Tecto de iteração da simulação (evita varrer anos por engano). */
const MAX_SIM_MINUTES = 60 * 24 * 366;

/** Substitui comentários YAML (`#`) por espaços, preservando as linhas. */
function maskYamlComments(text) {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const quote = c;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\' && quote === '"') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '#' && (i === 0 || /[\s]/.test(text[i - 1]))) {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      for (let k = i; k < end; k += 1) out[k] = ' ';
      i = end;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Expressões `cron:` do bloco `on.schedule:` de um workflow.
 * Comentários primeiro (`# - cron: ...` não conta), e só dentro de `on:` —
 * um `cron:` citado noutro sítio do ficheiro não é um agendamento.
 * @param {string} yaml
 * @returns {string[]}
 */
function parseCrons(yaml) {
  if (typeof yaml !== 'string') return [];
  const text = maskYamlComments(yaml);
  const lines = text.split('\n');

  const onStart = lines.findIndex((l) => /^on:/.test(l));
  if (onStart === -1) return [];
  let onEnd = lines.length;
  for (let i = onStart + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_-]+:/.test(lines[i])) {
      onEnd = i;
      break;
    }
  }

  const schedStart = lines.findIndex((l, i) => i > onStart && i < onEnd && /^ {2}schedule:/.test(l));
  if (schedStart === -1) return [];
  let schedEnd = onEnd;
  for (let i = schedStart + 1; i < onEnd; i += 1) {
    if (/^ {2}[A-Za-z_-]+:/.test(lines[i])) {
      schedEnd = i;
      break;
    }
  }

  const crons = [];
  for (const line of lines.slice(schedStart + 1, schedEnd)) {
    const m = /^\s*-\s*cron:\s*'([^']+)'|^\s*-\s*cron:\s*"([^"]+)"|^\s*-\s*cron:\s*(\S+)/.exec(line);
    if (m) {
      const expr = (m[1] || m[2] || m[3] || '').trim();
      if (expr) crons.push(expr);
    }
  }
  return crons;
}

/**
 * Expande um campo cron (`*`, `a`, `a,b`, `a-b`, e passos com `/n` nas duas
 * formas). Nota: não escrever o passo de «qualquer» com barra dentro de um
 * comentário de bloco — fecha-o.)
 * @returns {{ any: boolean, values: Set<number> } | null} null = inválido
 */
function expandField(field, min, max) {
  const spec = String(field ?? '').trim();
  if (spec === '*') return { any: true, values: new Set() };
  const values = new Set();
  for (const part of spec.split(',')) {
    const stepMatch = /^(\*|\d+|\d+-\d+)\/(\d+)$/.exec(part);
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    const singleMatch = /^\d+$/.exec(part);
    if (stepMatch) {
      const step = Number(stepMatch[2]);
      if (!Number.isInteger(step) || step <= 0) return null;
      let lo = min;
      let hi = max;
      if (stepMatch[1] !== '*') {
        const r = /^(\d+)-(\d+)$/.exec(stepMatch[1]);
        if (!r) {
          lo = Number(stepMatch[1]);
          hi = max;
        } else {
          lo = Number(r[1]);
          hi = Number(r[2]);
        }
      }
      if (lo < min || hi > max || lo > hi) return null;
      for (let v = lo; v <= hi; v += step) values.add(v);
      continue;
    }
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (lo < min || hi > max || lo > hi) return null;
      for (let v = lo; v <= hi; v += 1) values.add(v);
      continue;
    }
    if (singleMatch) {
      const v = Number(singleMatch[0]);
      if (v < min || v > max) return null;
      values.add(v);
      continue;
    }
    return null;
  }
  return { any: false, values };
}

/** Campos de uma expressão cron (5 valores, UTC) ou null se inválida. */
function cronFields(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = expandField(parts[0], 0, 59);
  const hour = expandField(parts[1], 0, 23);
  const dom = expandField(parts[2], 1, 31);
  const month = expandField(parts[3], 1, 12);
  // 0–7 no dia-da-semana: 7 = domingo (o GitHub aceita os dois), normalizado
  // para 0 depois de expandir.
  let dow = expandField(parts[4], 0, 7);
  if (dow && !dow.any && dow.values.has(7)) {
    dow = { any: false, values: new Set([...dow.values].map((v) => (v === 7 ? 0 : v))) };
  }
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

/** O minuto de `d` casa com a expressão? (semântica Vixie para dom/dow) */
function matchesMinute(fields, d) {
  const has = (set, v) => set.any || set.values.has(v);
  if (!has(fields.minute, d.getUTCMinutes())) return false;
  if (!has(fields.hour, d.getUTCHours())) return false;
  if (!has(fields.month, d.getUTCMonth() + 1)) return false;

  const domOk = has(fields.dom, d.getUTCDate());
  const dowOk = has(fields.dow, d.getUTCDay());
  if (fields.dom.any && fields.dow.any) return true;
  if (fields.dom.any) return dowOk;
  if (fields.dow.any) return domOk;
  // Ambos restritos: o cron clássico dispara quando QUALQUER um casa.
  return domOk || dowOk;
}

/**
 * Quantas vezes estas expressões disparam nos minutos de `(fromMs, toMs]`
 * (início exclusivo: «nas 24 h que terminam agora» são 24 h, não 24 h + 1
 * minuto). Simulação minuto a minuto — exacta para qualquer
 * forma de campo (passos como `/2` em dia-do-mês, listas, faixas), sem
 * aproximações.
 * @param {string[]} crons
 * @param {number} fromMs
 * @param {number} toMs
 * @returns {number}
 */
function expectedRuns(crons, fromMs, toMs) {
  const parsed = crons.map(cronFields).filter(Boolean);
  if (parsed.length === 0) return 0;
  const start = (Math.floor(fromMs / 60000) + 1) * 60000;
  const steps = Math.floor((toMs - start) / 60000) + 1;
  if (steps <= 0) return 0;
  let count = 0;
  for (let i = 0; i < Math.min(steps, MAX_SIM_MINUTES); i += 1) {
    const d = new Date(start + i * 60000);
    for (const f of parsed) if (matchesMinute(f, d)) count += 1;
  }
  return count;
}

/**
 * Julga a entrega de um workflow.
 * @param {{
 *   workflow?: string,
 *   crons: string[],
 *   observed24h: number | null,
 *   observed7d: number | null,
 *   nowMs?: number,
 * }} input
 * @returns {{
 *   judge: boolean,
 *   reason: string,
 *   windowHours: number | null,
 *   expected: number | null,
 *   observed: number | null,
 *   expectedPerDay: number | null,
 *   ratio: number | null,
 *   belowHalf: boolean,
 * }}
 */
function evaluateCronDelivery(input) {
  const { crons = [], observed24h = null, observed7d = null, nowMs = Date.now() } = input;

  // Ritmo nominal por dia = o que dispara numa semana a dividir por 7. Um
  // cron semanal dispara 0 vezes em muitas janelas de 24 h, por isso a janela
  // NÃO pode ser escolhida pelo que couber nas últimas 24 h.
  const expectedPerWeek = expectedRuns(crons, nowMs - WINDOW_HOURS_SLOW * 3600_000, nowMs);
  const expectedPerDay = expectedPerWeek / 7;
  const base = {
    judge: false,
    reason: '',
    windowHours: null,
    expected: null,
    observed: null,
    expectedPerDay,
    ratio: null,
    belowHalf: false,
  };

  if (expectedPerDay <= 0) {
    return { ...base, reason: 'sem expressões cron avaliáveis — não julgado' };
  }

  const fast = expectedPerDay >= FAST_WINDOW_MIN_PER_DAY;
  const windowHours = fast ? WINDOW_HOURS_FAST : WINDOW_HOURS_SLOW;
  const observed = fast ? observed24h : observed7d;
  const expected = fast
    ? expectedRuns(crons, nowMs - WINDOW_HOURS_FAST * 3600_000, nowMs)
    : expectedPerWeek;

  if (!Number.isFinite(observed) || observed === null) {
    return { ...base, windowHours, expected, reason: 'contagem observada indisponível (API) — não julgado' };
  }
  if (expected <= 0) {
    return { ...base, windowHours, observed, reason: 'esperado 0 na janela — não julgado' };
  }

  const ratio = observed / expected;
  return {
    judge: true,
    reason: '',
    windowHours,
    expected,
    observed,
    expectedPerDay,
    ratio,
    belowHalf: ratio < BELOW_HALF_RATIO,
  };
}

module.exports = {
  FAST_WINDOW_MIN_PER_DAY,
  WINDOW_HOURS_FAST,
  WINDOW_HOURS_SLOW,
  BELOW_HALF_RATIO,
  maskYamlComments,
  parseCrons,
  expandField,
  cronFields,
  matchesMinute,
  expectedRuns,
  evaluateCronDelivery,
};
