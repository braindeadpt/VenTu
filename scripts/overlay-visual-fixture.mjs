#!/usr/bin/env node
/**
 * Copia a fixture do pixel gate (tests/e2e/fixtures/data) para public/data
 * ANTES de um build dedicado à regressão visual.
 *
 * Porquê: o visual-regression.spec.ts serve /data/** a partir da fixture, mas o
 * HTML estático é pré-renderizado no build a partir de public/data — os dados
 * do dia. Cada commit do pipeline de dados (~15×/dia) mudava esse HTML
 * (altura de listas, chips de boia, contagens) e o gate ficava vermelho sem
 * nenhuma alteração de código. Com a fixture também no build, o HTML baked e
 * os fetches client-side vêm do MESMO snapshot: os píxeis só mudam com código.
 *
 * Só para builds de captura (CI pixel gate e record-visual-baselines). Nunca
 * correr antes de um build que vai ser publicado.
 *
 * radar/** fica de fora (como no sync-visual-fixture.mjs): os frames rodam a
 * cada refresh, o carrossel está mascarado e o spec usa o snapshot do build.
 *
 * forecasts/ é TROCADA por inteiro (não sobreposta): desde 25/10/2026 o build
 * lê as previsões dos ficheiros por spot (o agregado forecasts.json deixou de
 * existir), e um spot real que a fixture não tem ficaria com a série do dia
 * no HTML baked. O forecasts.json da fixture, se ainda existir, não é copiado
 * — já ninguém o lê.
 *
 *   node scripts/overlay-visual-fixture.mjs && npm run build
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = process.cwd();
const src = join(root, 'tests', 'e2e', 'fixtures', 'data');
const dest = join(root, 'public', 'data');
const EXCLUIR = new Set(['radar', 'forecasts.json']);

if (!existsSync(src)) {
  console.error(`overlay-visual-fixture: fixture em falta (${relative(root, src)})`);
  process.exit(1);
}

let n = 0;
function copiar(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const rel = relative(src, abs);
    if (EXCLUIR.has(rel.split(/[\\/]/)[0])) continue;
    if (e.isDirectory()) {
      copiar(abs);
    } else if (e.isFile()) {
      const alvo = join(dest, rel);
      mkdirSync(dirname(alvo), { recursive: true });
      copyFileSync(abs, alvo);
      n += 1;
    }
  }
}
if (existsSync(join(src, 'forecasts'))) rmSync(join(dest, 'forecasts'), { recursive: true, force: true });
copiar(src);
console.log(`overlay-visual-fixture: ${n} ficheiros da fixture copiados para public/data`);
