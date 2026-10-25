/**
 * Motor único (#218): tabela antes/depois motor antigo (`sportScore`) × v6
 * sobre as MESMAS linhas do forecast. É a tabela que cada PR da migração põe
 * no corpo (Guincho, Nazaré, Carcavelos, Peniche, Lagoa de Albufeira e um
 * spot do Algarve; kite e surf; 3 horas), mais o resumo das 48 h desses spots.
 *
 * Uso (na raiz do repo):
 *   npx tsx scripts/paridade-motor.ts                 # public/data, «agora» = map-hours.generatedAt
 *   DATA_DIR=tests/e2e/fixtures/data npx tsx scripts/paridade-motor.ts
 *   npx tsx scripts/paridade-motor.ts --json          # registos em JSON
 * Variáveis: DATA_DIR, NOW_ISO, SPOTS (ids separados por vírgulas),
 * HORAS (horas locais de Lisboa, por omissão 09,13,17), NH (horas do resumo, 48).
 *
 * Não escreve nada: só lê `forecasts/<serie>.json` e imprime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spots } from '../src/lib/spots';
import { comparaHora, type ComparacaoHora } from '../src/lib/notaUnica';
import { findCoveredHourIndex } from '../src/lib/openMeteoTime';
import type { LinhaForecast } from '../src/lib/horaSpot';
import type { Spot } from '../src/types';

export const SPOTS_PARIDADE = ['guincho', 'nazare', 'carcavelos', 'supertubos', 'lagoa-albufeira', 'lagos'] as const;
const SPORTS = ['kitesurf', 'surf'] as const;
const NOME_BANDA: Record<string, string> = {
  nao: 'Não dá',
  fraco: 'Fraco',
  da: 'Dá',
  bom: 'Bom',
  mb: 'Muito bom',
  noite: 'noite',
  'sem-dados': 'sem dados',
};

function lerJson(f: string): unknown {
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function serieDe(sp: Spot): string {
  return (sp as Spot & { conditionsSource?: string }).conditionsSource ?? sp.id;
}

export function linhasDe(dataDir: string, sp: Spot): LinhaForecast[] | null {
  const f = path.join(dataDir, 'forecasts', `${serieDe(sp)}.json`);
  if (!fs.existsSync(f)) return null;
  return (lerJson(f) as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
}

function main() {
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'public/data');
  const mh = path.join(dataDir, 'map-hours.json');
  const nowIso =
    process.env.NOW_ISO ?? (fs.existsSync(mh) ? (lerJson(mh) as { generatedAt: string }).generatedAt : new Date().toISOString());
  const now = new Date(nowIso);
  const ids = (process.env.SPOTS ?? SPOTS_PARIDADE.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const horas = (process.env.HORAS ?? '09,13,17').split(',').map((h) => h.trim().padStart(2, '0'));
  const NH = Number(process.env.NH ?? 48);

  const tabela: ComparacaoHora[] = [];
  const resumo: ComparacaoHora[] = [];
  const faltam: string[] = [];
  for (const id of ids) {
    const sp = (spots as Spot[]).find((s) => s.id === id);
    const linhas = sp && linhasDe(dataDir, sp);
    if (!sp || !linhas) {
      faltam.push(id);
      continue;
    }
    const i0 = findCoveredHourIndex(linhas.map((l) => l.time), now);
    if (i0 < 0) {
      faltam.push(`${id} (sem hora coberta)`);
      continue;
    }
    const janela = Array.from({ length: Math.min(NH, linhas.length - i0) }, (_, k) => i0 + k);
    // as 3 horas da tabela: as primeiras ocorrências de HORAS a partir de «agora»
    const escolhidas = horas
      .map((hh) => janela.find((j) => String(linhas[j].time).slice(11, 13) === hh))
      .filter((j): j is number => j != null)
      .sort((a, b) => a - b);
    for (const sport of SPORTS) {
      for (const j of janela) resumo.push(comparaHora(sp, sport, linhas, j));
      for (const j of escolhidas) tabela.push(comparaHora(sp, sport, linhas, j));
    }
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ dataDir, now: nowIso, tabela, resumo, faltam }, null, 1)}\n`);
    return;
  }

  const fmt = (n: number | null, b: string) => (n == null ? NOME_BANDA[b] ?? b : `${n} · ${NOME_BANDA[b] ?? b}`);
  const nome = (id: string) => (spots as Spot[]).find((s) => s.id === id)?.name ?? id;
  const out: string[] = [];
  out.push(`Dados: \`${path.relative(process.cwd(), dataDir) || '.'}\` · «agora» ${nowIso}`);
  out.push('');
  out.push('| Spot | Modalidade | Hora | Antes (sportScore) | Depois (v6) | Δ nota |');
  out.push('|---|---|---|---|---|---|');
  for (const r of tabela) {
    const d = r.v6.nota == null ? '—' : String(r.v6.nota - r.antigo.nota);
    out.push(
      `| ${nome(r.spot)} | ${r.sport === 'kitesurf' ? 'kite' : 'surf'} | ${r.t.replace('T', ' ')} | ${fmt(r.antigo.nota, r.antigo.banda)} | ${fmt(r.v6.nota, r.v6.banda)} | ${d} |`,
    );
  }
  out.push('');
  out.push(`Resumo (${NH} h, estes spots):`);
  out.push('');
  out.push('| Modalidade | horas de dia | banda diferente | nota diferente | noite (antigo dá nota) |');
  out.push('|---|---|---|---|---|');
  for (const sport of SPORTS) {
    const rs = resumo.filter((r) => r.sport === sport);
    const dia = rs.filter((r) => r.v6.nota != null);
    const noite = rs.filter((r) => r.v6.banda === 'noite');
    const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(1).replace('.', ',') : '0'} %`;
    out.push(
      `| ${sport === 'kitesurf' ? 'kite' : 'surf'} | ${dia.length} | ${pct(dia.filter((r) => r.antigo.banda !== r.v6.banda).length, dia.length)} | ${pct(dia.filter((r) => r.antigo.nota !== r.v6.nota).length, dia.length)} | ${noite.filter((r) => r.antigo.nota > 0).length} de ${noite.length} |`,
    );
  }
  if (faltam.length) out.push('', `Sem série: ${faltam.join(', ')}`);
  process.stdout.write(`${out.join('\n')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
