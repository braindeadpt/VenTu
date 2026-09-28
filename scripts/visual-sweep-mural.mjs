#!/usr/bin/env node
/**
 * Mural das grelhas: todas as grelhas de contacto reduzidas para uma imagem só.
 *
 * Revisão sistemática precisa de ser feita em duas escalas. Numa grelha a 100%
 * vê-se uma rota; num mural vêem-se 30 grelhas e o que salta é o GRITO — um
 * tema que não pinta, uma página em branco, um bloco que desaba. Depois
 * amplia-se só o que gritou.
 *
 * Uso: node scripts/visual-sweep-mural.mjs [--cols 4] [--width 300] [--filter all]
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = path.resolve(flag('dir', '_audit/visual-sweep'));
const SHEETS = path.join(DIR, 'sheets');
const COLS = Number(flag('cols', 4));
const W = Number(flag('width', 300));
const FILTER = flag('filter', '');
const BAR = 22;
const GAP = 10;

const index = JSON.parse(fs.readFileSync(path.join(SHEETS, 'index.json'), 'utf8'));
// `index.json` guarda caminhos absolutos (vêm de `sharp`/`path.join`); o mural
// só quer o nome, senão `path.join(SHEETS, abs)` duplica o caminho.
// `MURAL` fora: ele próprio é um `.jpg` na pasta e entraria na imagem que está a
// ser construída (recursão com uma linha: o mural a incluir o mural anterior).
const entries = index
  .map((e) => ({ ...e, file: path.basename(e.file) }))
  .filter((e) => e.file.endsWith('.jpg') && !e.file.startsWith('MURAL') && (!FILTER || e.file.includes(FILTER)));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const tiles = [];
for (const e of entries) {
  const src = path.join(SHEETS, e.file);
  const meta = await sharp(src).metadata();
  const h = Math.round((meta.height / meta.width) * W);
  const buf = await sharp(src).resize({ width: W }).jpeg({ quality: 72 }).toBuffer();
  const bar = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}">` +
      `<rect width="${W}" height="${BAR}" fill="#111c33"/>` +
      `<text x="4" y="15" font-family="Menlo,monospace" font-size="11" fill="#7dd3fc">${esc(e.file.replace(/\.jpg$/, ''))}</text>` +
      `</svg>`,
  );
  tiles.push({ buf, tileH: h + BAR, label: e.file, bar });
}

const rowH = [];
let maxH = Math.max(...tiles.map((t) => t.tileH));
for (let i = 0; i < tiles.length; i += COLS) rowH.push(maxH);
const totalW = COLS * W + (COLS + 1) * GAP;
const totalH = rowH.reduce((s, h) => s + h + GAP, GAP);

const composites = [];
for (const [i, t] of tiles.entries()) {
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  const top = GAP + row * (maxH + GAP);
  const left = GAP + col * (W + GAP);
  composites.push({ input: t.bar, top, left });
  composites.push({ input: t.buf, top: top + BAR, left });
}
const out = path.join(SHEETS, `MURAL${FILTER ? '-' + FILTER : ''}.jpg`);
await sharp({ create: { width: totalW, height: totalH, channels: 3, background: '#060b16' } })
  .composite(composites)
  .jpeg({ quality: 78 })
  .toFile(out);
console.error(`mural: ${out} ${totalW}×${totalH} · ${tiles.length} grelhas em ${rowH.length} linhas de ${COLS}`);
for (const [i, t] of tiles.entries()) {
  console.error(`  linha ${Math.floor(i / COLS) + 1} coluna ${(i % COLS) + 1}: ${t.label}`);
}
