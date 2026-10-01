#!/usr/bin/env node
/**
 * Provas de contraste a 100%.
 *
 * Os achados de contraste (`texto-invisivel`, `caixa-sem-tinta`) vivem numa
 * caixa de poucos píxeis dentro de uma captura de página inteira. Numa grelha de
 * contacto essa caixa é um borrão; aqui é recortada da captura ORIGINAL, sem
 * redução nenhuma, e ampliada com vizinho-mais-próximo para o glifo ficar
 * quadrado — é o que permite responder «o texto está lá e é ilegível» ou «não
 * está lá nada» com os olhos, e não com um número.
 *
 * Uso:
 *   node scripts/visual-sweep-zoom.mjs [--kind texto-invisivel,caixa-sem-tinta]
 *        [--pad 24] [--zoom 3] [--rows 6] [--dir DIR]
 *
 * Escreve `sheets/zoom-<kind>-NN.jpg`. Para o índice, correr a seguir
 * `node scripts/visual-sweep-sheets.mjs --index-only`.
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
const KINDS = flag('kind', 'texto-invisivel,caixa-sem-tinta').split(',').filter(Boolean);
const PATHS = flag('paths', '').split(',').filter(Boolean);
const COMBOS = flag('combo', '').split(',').filter(Boolean);
const TAG = flag('tag', '');
const SUFFIX = flag('suffix', '');
const PAD = Number(flag('pad', 24));
const ZOOM = Number(flag('zoom', 3));
const ROWS = Number(flag('rows', 6));
const GAP = 8;
const BAR = 30;

fs.mkdirSync(SHEETS, { recursive: true });

const findings = JSON.parse(fs.readFileSync(path.join(DIR, 'findings.json'), 'utf8')).findings;
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const slugOf = (p) => manifest.routes.find((r) => r.path === p)?.slug ?? p.replace(/[^a-z0-9]+/gi, '_');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A amostra que produziu o achado: a caixa que o colector mediu, no DOM. */
function sampleFor(f) {
  const recFile = path.join(DIR, 'records', f.combo, `${slugOf(f.path)}.json`);
  if (!fs.existsSync(recFile)) return null;
  const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
  const samples = rec.measure?.contrast ?? [];
  const quoted = f.detail.match(/«([^»]+)»/)?.[1] ?? '';
  return samples.find((s) => quoted && s.text.includes(quoted.slice(0, 24))) ?? null;
}

function label(w, text) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${BAR}">` +
      `<rect width="${w}" height="${BAR}" fill="#0b1220"/>` +
      `<text x="5" y="19" font-family="Menlo,monospace" font-size="12" fill="#cbd5e1">${esc(text)}</text>` +
      `</svg>`,
  );
}

/** Recorte a 100%, ampliado com vizinho-mais-próximo (glifo quadrado, sem blur). */
async function crop100(shot, s, caption) {
  const meta = await sharp(shot).metadata();
  const left = Math.max(0, s.x - PAD);
  const top = Math.max(0, s.y - PAD);
  const width = Math.min(meta.width - left, s.w + 2 * PAD);
  const height = Math.min(meta.height - top, s.h + 2 * PAD);
  const big = await sharp(shot)
    .extract({ left, top, width, height })
    .resize({ width: width * ZOOM, height: height * ZOOM, kernel: 'nearest' })
    .toBuffer();
  // Uma moldura clara em volta da caixa medida: diz ao olho onde está a prova.
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * ZOOM}" height="${height * ZOOM}">` +
      `<rect x="${(s.x - left) * ZOOM + 0.5}" y="${(s.y - top) * ZOOM + 0.5}" width="${s.w * ZOOM - 1}" height="${s.h * ZOOM - 1}"` +
      ` fill="none" stroke="#f472b6" stroke-width="1.5"/></svg>`,
  );
  const framed = await sharp(big).composite([{ input: ring }]).jpeg({ quality: 92 }).toBuffer();
  const w = Math.max(width * ZOOM, 640);
  return sharp({ create: { width: w, height: BAR + height * ZOOM, channels: 3, background: '#060b16' } })
    .composite([
      { input: label(w, caption), top: 0, left: 0 },
      { input: framed, top: BAR, left: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

for (const kind of KINDS) {
  const list = findings.filter(
    (f) =>
      f.kind === kind &&
      (!PATHS.length || PATHS.includes(f.path)) &&
      (!COMBOS.length || COMBOS.includes(f.combo)),
  );
  if (!list.length) {
    console.error(`${kind}: sem achados`);
    continue;
  }
  const pieces = [];
  for (const f of list) {
    const s = sampleFor(f);
    if (!s) {
      console.error(`${kind}: sem amostra em ${f.combo} ${f.path}`);
      continue;
    }
    const shot = path.join(DIR, 'shots', f.combo, `${slugOf(f.path)}.jpg`);
    if (!fs.existsSync(shot)) {
      console.error(`${kind}: sem captura ${shot}`);
      continue;
    }
    const dom = f.detail.match(/DOM promete ([\d.]+):1/)?.[1];
    const px = f.detail.match(/píxeis medem ([\d.]+):1/)?.[1];
    const sep = f.detail.match(/separação ([\d.]+)/)?.[1];
    const caption =
      `${f.combo} ${f.path} · «${s.text.slice(0, 26)}» · ${s.w}×${s.h} @${s.fontSize}px ${s.color} sobre ${s.bg}` +
      (px && dom ? ` · píxeis ${px}:1 vs DOM ${dom}:1` : ` · separação ${sep}`);
    pieces.push({ caption, buf: await crop100(shot, s, caption) });
  }
  for (let i = 0; i < pieces.length; i += ROWS) {
    const chunk = pieces.slice(i, i + ROWS);
    const metas = await Promise.all(chunk.map((c) => sharp(c.buf).metadata()));
    const w = Math.max(...metas.map((m) => m.width));
    const totalH = chunk.reduce((s, c, j) => s + metas[j].height + GAP, GAP);
    const composites = [];
    let top = GAP;
    for (const [j, c] of chunk.entries()) {
      composites.push({ input: c.buf, top, left: 0 });
      top += metas[j].height + GAP;
    }
    const file = path.join(SHEETS, `zoom-${kind}${SUFFIX}${TAG}-${String(i / ROWS + 1).padStart(2, '0')}.jpg`);
    await sharp({ create: { width: w, height: totalH, channels: 3, background: '#060b16' } })
      .composite(composites)
      .jpeg({ quality: 86 })
      .toFile(file);
    console.error(`${path.basename(file)}  ${w}×${totalH}  ${chunk.length} provas`);
  }
}
console.error('\nrecortes a 100% em', SHEETS, '· correr `--index-only` nas grelhas para os incluir no índice.');
