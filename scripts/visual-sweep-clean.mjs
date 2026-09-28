#!/usr/bin/env node
/**
 * Limpa do varrimento visual as capturas que não descrevem o produto.
 *
 * Critério (explícito, para não apagar nada de bom): o registo não descreve uma
 * página servida com sucesso — `status` ≠ 200, erro de navegação, sem medição,
 * JPEG em falta, ou um pedido falhado que seja claramente da INFRAESTRUTURA do
 * varrimento (`ERR_CONNECTION_REFUSED`, `EMFILE`, `ERR_INSUFFICIENT_RESOURCES`)
 * e não de embeds de terceiros do produto. As falhas de terceiros ficam: são
 * achados.
 *
 * Uso: node scripts/visual-sweep-clean.mjs [--dir DIR] [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = path.resolve(flag('dir', '_audit/visual-sweep'));
const DRY = args.includes('--dry');

const INFRA = /CONNECTION_REFUSED|EMFILE|ERR_INSUFFICIENT_RESOURCES|ERR_OUT_OF_MEMORY|ERR_NETWORK_CHANGED/;

let removed = 0;
let kept = 0;
const reasons = {};
for (const combo of fs.existsSync(path.join(DIR, 'records')) ? fs.readdirSync(path.join(DIR, 'records')) : []) {
  const dir = path.join(DIR, 'records', combo);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const recordFile = path.join(dir, f);
    const rec = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    const shot = path.join(DIR, 'shots', combo, `${rec.slug}.jpg`);
    let reason = null;
    if (!fs.existsSync(shot)) reason = 'sem JPEG';
    else if (rec.status !== 200) reason = `status ${rec.status}`;
    else if (rec.navError) reason = 'erro de navegação';
    else if (!rec.measure) reason = 'sem medição';
    else if ((rec.failedRequests ?? []).some((r) => INFRA.test(r))) reason = 'falha de infraestrutura';
    if (!reason) {
      kept++;
      continue;
    }
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    removed++;
    if (!DRY) {
      fs.rmSync(recordFile, { force: true });
      fs.rmSync(shot, { force: true });
    }
  }
}

console.log(
  `${DRY ? '[ensaio] ' : ''}capturas mantidas: ${kept} · ${DRY ? 'a apagar' : 'apagadas'}: ${removed}` +
    (removed ? ` (${Object.entries(reasons).map(([k, v]) => `${k}=${v}`).join(', ')})` : ''),
);
