/**
 * Motor único (#218): paridade ENTRE SUPERFÍCIES do motor v6.
 *
 * Desde o PR 6 já não há «antes» (motor antigo) para comparar nas modalidades
 * v6: este script prova que todas as superfícies dão o MESMO número v6 por
 * spot, hora e modalidade (kitesurf, surf, windsurf, bodyboard, foil). A
 * referência é a régua de 48 h da página do spot (`notaHora` sobre a série
 * do spot); o «agora» é o `notaV6` que o pipeline grava no `conditions.json`
 * (linha D4 = hora coberta + observações frescas).
 *
 * Superfícies verificadas (cada uma conta como diferença se não bater):
 * - `notaV6`      — o gravado no `conditions.json` = o que o pipeline grava hoje
 *                   (`notaV6AgoraDe`) — só se o ficheiro trouxer `notaV6`;
 * - `map-hours`   — `buildMapHoursFile`: frame 0 = `notaV6` × 10, frames
 *                   seguintes = régua do spot × 10 na mesma hora (noite = null);
 *                   e o `map-hours.json` de DATA_DIR = o build; `best` = regra do
 *                   «Todos» (`melhorTodos`) sobre as frames;
 * - `listas`      — o bake das listagens / spots-index (`allScoresComV6`):
 *                   score = `notaV6` × 10 (noite → 0 com `noite`), e o «Todos»
 *                   (`scoreTodos`) = `melhorTodos` do `notaV6`;
 * - `janelas`     — `bestWindowBuild`: as notas horárias das janelas
 *                   (`notasV6Horas`, 48 h da régua) = régua do spot (hora 0 =
 *                   `notaV6`) e a melhor janela de 48 h = `melhorJanelaV6` delas;
 * - `alertas`     — `computeAlertScore` (email/Telegram) = `notaV6` (noite ⇔ null).
 *
 * Uso (na raiz do repo):
 *   npx tsx scripts/paridade-motor.ts                          # public/data, «agora» = map-hours.generatedAt
 *   DATA_DIR=tests/e2e/fixtures/data npx tsx scripts/paridade-motor.ts
 *   npx tsx scripts/paridade-motor.ts --json                   # contagens + diferenças em JSON
 * Variáveis: DATA_DIR, NOW_ISO, SPOTS (ids separados por vírgulas; por omissão todos).
 * Sai com código 1 se houver alguma diferença. Não escreve nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spots } from '../src/lib/spots';
import { notaHora, type SportScoreV6 } from '../src/lib/notaUnica';
import { findCoveredHourIndex } from '../src/lib/openMeteoTime';
import { buildMapHoursFile } from '../src/lib/mapHoursBuild';
import { notaV6AgoraDe } from '../src/lib/notaV6AgoraBuild';
import { allScoresComV6, notaV6DoSpot, type NotaV6Agora } from '../src/lib/notaV6Agora';
import { DESPORTO_PARA_AGORA, DESPORTOS_V6, melhorTodos, scoreTodos, type ModalidadeAgora } from '../src/lib/desportosV6';
import { getCompatibleSports, type SportType } from '../src/lib/sportRatings';
import { rawToScoreInput } from '../src/lib/scoreConditions';
import { resolveConditionsEntry } from '../src/lib/spotConditionsSource';
import { computeUpcomingWindowsForSpot, indicesRegua, notasV6Horas } from '../src/lib/bestWindowBuild';
import type { ForecastHourRow } from '../src/lib/bestWindowToday';
import { melhorJanelaV6 } from '../src/lib/janelasV6';
import type { LinhaForecast } from '../src/lib/horaSpot';
import type { Spot } from '../src/types';

const req = createRequire(__filename);
const { computeAlertScore, makeForecastReader } = req('./lib/scoreSpotConditions.js') as {
  computeAlertScore: (
    id: string,
    sport: string,
    cond: Record<string, unknown>,
    opc: { nowMs: number; forecastFor: (id: string) => unknown },
  ) => { night: true } | { nota: number } | null;
  makeForecastReader: (dir: string) => (id: string) => Array<Record<string, unknown>> | null;
};

export const SUPERFICIES = ['notaV6', 'map-hours', 'listas', 'janelas', 'alertas'] as const;
type Superficie = (typeof SUPERFICIES)[number];
const NH = 48;

export interface ResultadoParidade {
  dataDir: string;
  now: string;
  spots: number;
  /** comparações feitas por superfície × modalidade (+ `all` = «Todos»). */
  comparacoes: Record<Superficie, Record<string, number>>;
  diferencas: Array<{ superficie: Superficie; spot: string; sport: string; hora: string; esperado: unknown; obtido: unknown }>;
  semSerie: string[];
}

function lerJson(f: string): unknown {
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function serieDe(sp: Spot): string {
  return (sp as Spot & { conditionsSource?: string }).conditionsSource ?? sp.id;
}

const x10 = (n: number | null | undefined): number | null => (n == null ? null : n * 10);

export function paridadeMotor(opc: { dataDir: string; nowIso?: string; ids?: string[] }): ResultadoParidade {
  const { dataDir } = opc;
  const mhPath = path.join(dataDir, 'map-hours.json');
  const mhFile = fs.existsSync(mhPath)
    ? (lerJson(mhPath) as { generatedAt: string; times: string[]; spots: Record<string, Record<string, Array<number | null>>> })
    : null;
  const nowIso = opc.nowIso ?? mhFile?.generatedAt ?? new Date().toISOString();
  const now = new Date(nowIso);
  const nowMs = now.getTime();
  const conditions = lerJson(path.join(dataDir, 'conditions.json')) as Record<string, Record<string, unknown>>;
  const reader = makeForecastReader(dataDir);
  const sel = (spots as Spot[]).filter((s) => !opc.ids || opc.ids.includes(s.id));

  const comparacoes = Object.fromEntries(SUPERFICIES.map((s) => [s, {} as Record<string, number>])) as ResultadoParidade['comparacoes'];
  const diferencas: ResultadoParidade['diferencas'] = [];
  const semSerie: string[] = [];
  const conta = (sup: Superficie, sport: string) => {
    comparacoes[sup][sport] = (comparacoes[sup][sport] ?? 0) + 1;
  };
  const verifica = (sup: Superficie, spot: string, sport: string, hora: string, esperado: unknown, obtido: unknown) => {
    conta(sup, sport);
    if (JSON.stringify(esperado) !== JSON.stringify(obtido)) diferencas.push({ superficie: sup, spot, sport, hora, esperado, obtido });
  };

  // séries de previsão (mesma origem para todas as superfícies)
  const forecasts: Record<string, Array<Record<string, unknown>>> = {};
  for (const sp of sel) {
    const s = serieDe(sp);
    if (forecasts[s]) continue;
    const h = reader(s);
    if (Array.isArray(h)) forecasts[s] = h;
  }
  const mh = buildMapHoursFile({ forecasts, conditions, spots: sel, now, generatedAt: nowIso });
  const frameIdx = mh.times.map((t) => t.slice(0, 16));

  for (const sp of sel) {
    const serie = forecasts[serieDe(sp)];
    if (!serie) {
      semSerie.push(sp.id);
      continue;
    }
    const linhas = (serie as unknown as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
    const i0 = findCoveredHourIndex(linhas.map((l) => l.time), now);
    if (i0 < 0) {
      semSerie.push(`${sp.id} (sem hora coberta)`);
      continue;
    }
    const own = conditions[sp.id];
    const hours = reader(sp.id) ?? (sp.conditionsSource ? reader(sp.conditionsSource) : null);
    const pipeline = own ? notaV6AgoraDe(sp, own, hours, nowMs) : null;
    const gravado = notaV6DoSpot(sp, conditions);
    if (own && own.notaV6 !== undefined) verifica('notaV6', sp.id, '*', nowIso, pipeline, own.notaV6 ?? null);
    // o «agora» canónico: o gravado (o que o site serve); sem ficheiro com notaV6, o do pipeline
    const agora: NotaV6Agora | null = gravado ?? pipeline;
    const compat = new Set(getCompatibleSports(sp));

    // referência: régua do spot (48 h a partir da hora coberta)
    const ref: Record<string, Array<number | null>> = {};
    for (const sport of DESPORTOS_V6) {
      ref[sport] = Array.from({ length: Math.min(NH, linhas.length - i0) }, (_, k) => (notaHora(sp, sport, linhas, i0 + k) as SportScoreV6).nota);
    }
    const tRef = Array.from({ length: Math.min(NH, linhas.length - i0) }, (_, k) => String(linhas[i0 + k].time).slice(0, 16));
    const agoraDe = (sport: SportType): number | null | undefined => {
      const d = DESPORTO_PARA_AGORA[sport] as ModalidadeAgora;
      return agora ? agora[d] : undefined;
    };

    // ── map-hours ──
    const serieMh = mh.spots[sp.id];
    for (const sport of DESPORTOS_V6) {
      for (let f = 0; f < frameIdx.length; f++) {
        let esperado: number | null | undefined;
        if (f === 0 && agora) esperado = x10(agoraDe(sport));
        else {
          const k = tRef.indexOf(frameIdx[f]);
          if (k < 0) continue;
          esperado = x10(ref[sport][k]);
        }
        verifica('map-hours', sp.id, sport, frameIdx[f], esperado, serieMh[sport][f]);
        if (mhFile?.spots[sp.id]?.[sport] && JSON.stringify(mhFile.times) === JSON.stringify(mh.times)) {
          verifica('map-hours', sp.id, `${sport} (ficheiro)`, frameIdx[f], serieMh[sport][f], mhFile.spots[sp.id][sport][f]);
        }
      }
    }
    for (let f = 0; f < frameIdx.length; f++) {
      verifica('map-hours', sp.id, 'all', frameIdx[f], melhorTodos(sp, (s) => serieMh[s]?.[f]), serieMh.best[f]);
    }

    // ── listas (bake / spots-index) ──
    if (agora) {
      const raw = resolveConditionsEntry(sp, conditions) as Record<string, unknown> | null;
      if (raw) {
        const all = allScoresComV6(sp, rawToScoreInput(raw), agora);
        for (const sport of DESPORTOS_V6) {
          const n = agoraDe(sport);
          if (n === undefined) continue;
          verifica('listas', sp.id, sport, agora.t, n == null ? 0 : n * 10, all[sport].score);
        }
        const todos = melhorTodos(sp, (s) => (DESPORTO_PARA_AGORA[s] ? x10(agoraDe(s)) : all[s]?.score));
        verifica('listas', sp.id, 'all', agora.t, todos ?? 0, scoreTodos(sp, all));
      }
    }

    // ── janelas (bestWindowBuild, 48 h) ──
    const fc = serie as unknown as ForecastHourRow[];
    const js = indicesRegua(fc, NH, nowMs);
    const cur = rawToScoreInput((resolveConditionsEntry(sp, conditions) as Record<string, unknown>) ?? {});
    const janelas = computeUpcomingWindowsForSpot(sp, fc, cur, nowMs, agora);
    for (const sport of DESPORTOS_V6) {
      const horasJ = notasV6Horas(sp, sport, fc, js, nowMs, agora);
      const esperadas = js.map((j, k) => {
        const t = String(fc[j].time).slice(0, 16);
        if (k === 0 && agora && agora.t === t && agoraDe(sport) !== undefined) return agoraDe(sport) as number | null;
        const r = tRef.indexOf(t);
        return r >= 0 ? ref[sport][r] : (notaHora(sp, sport, linhas, j) as SportScoreV6).nota;
      });
      js.forEach((j, k) => verifica('janelas', sp.id, sport, String(fc[j].time).slice(0, 16), esperadas[k], horasJ[k]));
      if (!compat.has(sport)) continue;
      const w = melhorJanelaV6(esperadas);
      const esperado = w ? { startIso: String(fc[js[w.a]].time), endIso: String(fc[js[w.z]].time), score: w.score } : undefined;
      verifica('janelas', sp.id, `${sport} (melhor 48 h)`, nowIso, esperado, janelas[sport]);
    }

    // ── alertas (email / Telegram) ──
    if (agora) {
      for (const sport of DESPORTOS_V6) {
        const n = agoraDe(sport);
        if (n === undefined) continue;
        const a = computeAlertScore(sp.id, sport, conditions, { nowMs, forecastFor: reader });
        const obtido = a == null ? null : 'night' in a ? null : a.nota;
        verifica('alertas', sp.id, sport, agora.t, n, obtido);
      }
    }
  }

  return { dataDir, now: nowIso, spots: sel.length, comparacoes, diferencas, semSerie };
}

function main() {
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'public/data');
  const ids = process.env.SPOTS ? process.env.SPOTS.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const r = paridadeMotor({ dataDir, nowIso: process.env.NOW_ISO, ids });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(r, null, 1)}\n`);
  } else {
    const out: string[] = [];
    out.push(`Dados: \`${path.relative(process.cwd(), dataDir) || '.'}\` · «agora» ${r.now} · ${r.spots} spots`);
    out.push('');
    const cols = [...DESPORTOS_V6, 'all'];
    out.push(`| Superfície | ${cols.join(' | ')} | diferenças |`);
    out.push(`|---|${cols.map(() => '---').join('|')}|---|`);
    for (const s of SUPERFICIES) {
      const c = r.comparacoes[s];
      const porDesporto = (d: string) => Object.entries(c).filter(([k]) => k === d || k.startsWith(`${d} `)).reduce((a, [, v]) => a + v, 0);
      const extra = c['*'] ? ` (${c['*']} spots)` : '';
      out.push(`| ${s}${extra} | ${cols.map((d) => porDesporto(d) || '—').join(' | ')} | ${r.diferencas.filter((x) => x.superficie === s).length} |`);
    }
    out.push('');
    out.push(r.diferencas.length ? `**${r.diferencas.length} diferenças** (primeiras 30):` : '**0 diferenças.**');
    for (const d of r.diferencas.slice(0, 30)) {
      out.push(`- ${d.superficie} · ${d.spot} · ${d.sport} · ${d.hora}: esperado ${JSON.stringify(d.esperado)}, obtido ${JSON.stringify(d.obtido)}`);
    }
    if (r.semSerie.length) out.push('', `Sem série: ${r.semSerie.join(', ')}`);
    process.stdout.write(`${out.join('\n')}\n`);
  }
  if (r.diferencas.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
