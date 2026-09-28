#!/usr/bin/env node
/**
 * Grelhas de contacto do varrimento visual.
 *
 * Junta as capturas em folhas por família de template, com as combinações
 * tema×largura da mesma rota lado a lado e o TOPO da página (a dobra e um pouco
 * mais) à escala legível. É o artefacto para olhos humanos: 10 476 capturas não
 * se revêem uma a uma, uma grelha por família revê-se.
 *
 * Disposição das colunas (`--pairs`):
 *   theme (por omissão) — escuro | claro, uma folha por largura. É a evidência
 *     de «o tema não muda um píxel» e de contrastes.
 *   width — 390 | 1440, uma folha por tema. É a evidência de «o layout não
 *     responde à largura» e de overflow.
 *   all — escuro 1440 | claro 1440 | escuro 390 | claro 390, tudo na mesma
 *     linha. É o retrato completo de uma rota: qual dos quatro é o estranho
 *     salta à vista sem se andar a folhear folhas.
 *
 * Uso:
 *   node scripts/visual-sweep-sheets.mjs [--family spot,diretorio-registo]
 *        [--width 390,1440] [--theme dark,light] [--per-locale 3] [--rows 6]
 *        [--pairs all] [--flagged-first] [--kind texto-invisivel]
 *        [--paths /pt/spots/nazare/,/pt/mapa/] [--dir DIR] [--json]
 *
 * Escreve `sheets/<slug>.jpg` e reescreve `sheets/index.html` (com TODAS as
 * grelhas existentes, para não se perder nenhuma quando se corre o script
 * várias vezes com filtros diferentes).
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
const FAMILIES = flag('family', '').split(',').filter(Boolean);
const WIDTHS = flag('width', '390,1440').split(',').filter(Boolean);
const THEMES = flag('theme', 'dark,light').split(',').filter(Boolean);
const PAIRS = flag('pairs', 'theme');
const PER_LOCALE = Number(flag('per-locale', 3));
const KIND = flag('kind', '');
const PATHS = flag('paths', '').split(',').filter(Boolean);
const ROWS = Number(flag('rows', 6));
const FLAGGED_FIRST = args.includes('--flagged-first');
const GAP = 8;
const HEADER = 34;

fs.mkdirSync(SHEETS, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const routes = manifest.routes;
const findings = fs.existsSync(path.join(DIR, 'findings.json'))
  ? JSON.parse(fs.readFileSync(path.join(DIR, 'findings.json'), 'utf8'))
  : { findings: [] };

/** Achados por rota+combo, para as grelhas começarem pelo que é suspeito: uma
 *  linha marcada com ⚠ traz a lista de tipos na legenda da própria miniatura. */
const flagsByPathCombo = new Map();
for (const f of findings.findings ?? []) {
  const key = `${f.path}|${f.combo}`;
  if (!flagsByPathCombo.has(key)) flagsByPathCombo.set(key, new Set());
  flagsByPathCombo.get(key).add(f.kind);
}
const flagsOf = (routePath, theme, width) => [...(flagsByPathCombo.get(`${routePath}|${theme}-${width}`) ?? [])];
/** Todos os tipos que atingem a rota, em qualquer combinação. */
const flagsOfRoute = (routePath) => {
  const out = new Set();
  for (const theme of THEMES) for (const width of WIDTHS) for (const k of flagsOf(routePath, theme, width)) out.add(k);
  return [...out];
};

/** Colunas de cada folha, na ordem em que aparecem. */
function columnSets() {
  if (PAIRS === 'all') {
    return [
      {
        name: 'all',
        title: 'escuro 1440 · claro 1440 · escuro 390 · claro 390',
        cols: [
          { theme: 'dark', width: '1440' },
          { theme: 'light', width: '1440' },
          { theme: 'dark', width: '390' },
          { theme: 'light', width: '390' },
        ],
      },
    ];
  }
  if (PAIRS === 'width') {
    return THEMES.map((theme) => ({
      name: theme,
      title: `${theme} · 390 px vs 1440 px`,
      cols: [
        { theme, width: '390' },
        { theme, width: '1440' },
      ],
    }));
  }
  return WIDTHS.map((width) => ({
    name: width,
    title: `${width} px`,
    cols: [
      { theme: 'dark', width },
      { theme: 'light', width },
    ],
  }));
}
const SETS = columnSets();

const tileW = (width) => (width === '390' ? 220 : 430);
const tileH = (width) => (width === '390' ? 620 : 500);
const rowH = (cols) => Math.max(...cols.map((c) => tileH(c.width))) + 20;
const sheetW = (cols) => cols.reduce((s, c) => s + tileW(c.width), 0) + (cols.length + 1) * GAP;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Amostra determinística: passos iguais dentro da lista de cada locale. */
function sample(list, n) {
  if (list.length <= n) return [...list];
  const stride = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * stride)]);
}

function pickRoutes(family) {
  const inFamily = routes.filter((r) => r.family === family);
  const byLocale = new Map();
  for (const r of inFamily) {
    if (!byLocale.has(r.locale)) byLocale.set(r.locale, []);
    byLocale.get(r.locale).push(r);
  }
  const chosen = [];
  for (const [, list] of [...byLocale.entries()].sort()) {
    let ordered = [...list].sort((a, b) => (a.path < b.path ? -1 : 1));
    if (FLAGGED_FIRST) {
      // O que tem achados vai à frente para sobreviver à amostragem (o índice 0
      // é sempre escolhido) — sem isto, uma grelha de família é uma lotaria.
      ordered = [
        ...ordered.filter((r) => flagsOfRoute(r.path).length),
        ...ordered.filter((r) => !flagsOfRoute(r.path).length),
      ];
    }
    chosen.push(...sample(ordered, ordered.length <= PER_LOCALE ? ordered.length : PER_LOCALE));
  }
  return chosen;
}

function slugOf(routePath) {
  return routes.find((r) => r.path === routePath)?.slug ?? routePath.replace(/[^a-z0-9]+/gi, '_');
}

async function tile(file, label, width) {
  const w = tileW(width);
  const h = tileH(width);
  const resized = await sharp(file).resize({ width: w, fit: 'inside' }).toBuffer();
  // A altura do redimensionado lê-se do buffer, não se calcula: o sharp
  // TRUNCA a escala e o `Math.round` arredonda, e um píxel de diferença faz o
  // `extract` rebentar com «bad extract area» (1391 → 337 vs 338).
  const rmeta = await sharp(resized).metadata();
  const shownH = Math.min(h, rmeta.height);
  const top =
    shownH >= rmeta.height
      ? resized
      : await sharp(resized).extract({ left: 0, top: 0, width: Math.min(w, rmeta.width), height: shownH }).toBuffer();
  const labelH = 20;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${labelH}">` +
      `<rect width="${w}" height="${labelH}" fill="#0b1220"/>` +
      `<text x="5" y="14" font-family="Menlo,monospace" font-size="11" fill="#cbd5e1">${esc(label.slice(0, 60))}</text>` +
      `</svg>`,
  );
  return sharp({ create: { width: w, height: h + labelH, channels: 3, background: '#0b1220' } })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: top, top: labelH, left: 0 },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
}

function titleBar(width, text) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER}">` +
      `<rect width="${width}" height="${HEADER}" fill="#111c33"/>` +
      `<text x="8" y="22" font-family="Menlo,monospace" font-size="15" fill="#f1f5f9">${esc(text)}</text>` +
      `</svg>`,
  );
  return { svg, w: width, h: HEADER };
}

/** Constrói uma folha a partir de linhas `{ caption, tiles: [{file,label}] }`. */
async function buildSheet(name, rows, cols, title) {
  const w = sheetW(cols);
  const rh = rowH(cols);
  const totalH = HEADER + rows.length * (rh + GAP) + GAP;
  const bar = titleBar(w, title);
  const composites = [{ input: bar.svg, top: 0, left: 0 }];
  const missing = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const top = HEADER + GAP + i * (rh + GAP);
    let left = GAP;
    for (const [col, c] of cols.entries()) {
      const entry = row.tiles[col];
      if (!entry || !fs.existsSync(entry.file)) {
        missing.push(`${row.caption} (${c.theme}-${c.width})`);
        left += tileW(c.width) + GAP;
        continue;
      }
      composites.push({ input: await tile(entry.file, entry.label, c.width), top, left });
      left += tileW(c.width) + GAP;
    }
  }
  const file = path.join(SHEETS, `${name}.jpg`);
  // `toFile` e não `write`: no sharp 0.35 o `write` é a API de STREAM (uma
  // string de caminho é interpretada como dados e rebenta com «Unexpected data
  // on Writable Stream» — sem ficheiro e sem erro apanhável, só o `stat` a
  // seguir a dizer que não existe).
  await sharp({ create: { width: w, height: totalH, channels: 3, background: '#060b16' } })
    .composite(composites)
    .jpeg({ quality: 74 })
    .toFile(file);
  return { file, width: w, height: totalH, bytes: fs.statSync(file).size, rows: rows.length, captions: rows.map((r) => r.caption), missing };
}

/** Linha completa de uma rota: todas as colunas do conjunto, com os achados. */
const routeRow = (routePath, cols, family) => {
  const slug = slugOf(routePath);
  const flags = flagsOfRoute(routePath);
  return {
    caption: `${routePath}${family ? ` · ${family}` : ''}${flags.length ? ` ⚠ ${flags.join(',')}` : ''}`,
    tiles: cols.map((c) => {
      const f = flagsOf(routePath, c.theme, c.width);
      return {
        file: path.join(DIR, 'shots', `${c.theme}-${c.width}`, `${slug}.jpg`),
        label: `${routePath} · ${c.theme} ${c.width}${f.length ? ` ⚠ ${f.join(',')}` : ''}`,
      };
    }),
  };
};

/** Divide uma lista em blocos de ROWS e constrói uma folha por bloco. */
async function sheetsFor(nameBase, routePaths, cols, set, titleExtra = '') {
  const built = [];
  for (let i = 0; i < routePaths.length; i += ROWS) {
    const chunk = routePaths.slice(i, i + ROWS);
    const rows = chunk.map((p) => routeRow(p, cols, routes.find((r) => r.path === p)?.family));
    built.push(
      await buildSheet(
        `${nameBase}-${set.name}-${String(i / ROWS + 1).padStart(2, '0')}`,
        rows,
        cols,
        `${nameBase} · ${set.title}${titleExtra} · ${chunk.length} de ${routePaths.length} rotas`,
      ),
    );
  }
  return built;
}

const built = [];
const INDEX_ONLY = args.includes('--index-only');

if (INDEX_ONLY) {
  // Só reescrever o índice com o que já está em disco (útil depois de outro
  // script pousar folhas na pasta — p.ex. os recortes a 100%).
} else if (KIND) {
  const flagged = findings.findings.filter((f) => f.kind === KIND);
  const paths = [...new Set(flagged.map((f) => f.path))].sort();
  console.error(`${KIND}: ${flagged.length} provas em ${paths.length} rotas`);
  for (const set of SETS) {
    built.push(...(await sheetsFor(`kind-${KIND}`, paths, set.cols, set)));
  }
} else if (PATHS.length) {
  for (const set of SETS) built.push(...(await sheetsFor('paths', PATHS, set.cols, set)));
} else {
  const families = FAMILIES.length ? FAMILIES : [...new Set(routes.map((r) => r.family))].sort();
  for (const family of families) {
    const picked = pickRoutes(family);
    if (!picked.length) {
      console.error(`${family}: sem rotas no manifesto`);
      continue;
    }
    const total = routes.filter((r) => r.family === family).length;
    console.error(`${family}: ${picked.length} rotas amostradas de ${total}`);
    for (const set of SETS) {
      const paths = picked.map((r) => r.path);
      built.push(...(await sheetsFor(family, paths, set.cols, set, ` · ${picked.length} de ${total} rotas`)));
    }
  }
}

// ── índice HTML (todas as grelhas já construídas, não só as desta corrida) ──
const existing = fs
  .readdirSync(SHEETS)
  // O `MURAL*` é um derivado das grelhas (feito pelo `visual-sweep-mural.mjs`) e
  // não uma grelha: se entrar no índice, o mural dobra-se sobre si próprio.
  .filter((f) => f.endsWith('.jpg') && !f.startsWith('MURAL'))
  .sort();
const meta = new Map();
for (const sheet of built) meta.set(path.basename(sheet.file), sheet);
const stale = fs.existsSync(path.join(SHEETS, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(SHEETS, 'index.json'), 'utf8')) : [];
const entries = existing.map((f) => ({ file: f, ...(meta.get(f) ?? stale.find((s) => path.basename(s.file) === f) ?? {}) }));
// O índice em JSON lista TODAS as folhas em disco (não só as desta corrida),
// senão uma corrida com filtro apagava a ficha das folhas anteriores.
fs.writeFileSync(
  path.join(SHEETS, 'index.json'),
  JSON.stringify(
    entries.map((e) => ({
      file: e.file,
      width: e.width ?? null,
      height: e.height ?? null,
      bytes: e.bytes ?? null,
      rows: e.rows ?? null,
      captions: e.captions ?? [],
      missing: e.missing ?? [],
    })),
    null,
    1,
  ),
);

const html = [
  '<!doctype html><html lang="pt"><head><meta charset="utf-8">',
  '<title>Grelhas — varrimento visual do export</title>',
  '<style>',
  'body{background:#060b16;color:#e2e8f0;font:14px/1.5 ui-sans-serif,system-ui;margin:0;padding:24px}',
  'h1{font-size:20px;margin:0 0 4px}p.lead{color:#94a3b8;margin:0 0 24px}',
  'section{margin:0 0 40px;border-top:1px solid #1e293b;padding-top:16px}',
  'h2{font:13px/1.4 Menlo,monospace;color:#7dd3fc;margin:0 0 10px;font-weight:500}',
  'img{width:100%;max-width:1500px;height:auto;display:block;border:1px solid #1e293b}',
  'ul{margin:8px 0 0;padding-left:18px;color:#94a3b8;font:12px/1.6 Menlo,monospace}',
  'code{color:#fca5a5}',
  'nav a{color:#7dd3fc;font:12px/1.8 Menlo,monospace;text-decoration:none;margin-right:12px}',
  '</style></head><body>',
  `<h1>Grelhas do varrimento visual em píxeis</h1>`,
  `<p class="lead">${entries.length} grelhas · cada linha é uma rota com as combinações tema×largura lado a lado · o topo da página à escala legível` +
    ` (ou, nas <code>zoom-*</code>, o recorte das provas de contraste a 100%).` +
    ` Artefactos: <code>_audit/visual-sweep/</code> (manifesto, registos, capturas, achados).</p>`,
  '<nav>',
  ...entries.map((e) => `<a href="#${esc(path.basename(e.file, '.jpg'))}">${esc(path.basename(e.file, '.jpg'))}</a>`),
  '</nav>',
];
for (const e of entries) {
  const id = path.basename(e.file, '.jpg');
  html.push(`<section id="${esc(id)}">`);
  html.push(`<h2>${esc(path.basename(e.file))}${e.width ? ` · ${e.width}×${e.height} px · ${(e.bytes / 1024).toFixed(0)} kB` : ''}</h2>`);
  // Caminho RELATIVO: o índice é servido na raiz da pasta das grelhas, mas o
  // `index.json` guarda caminhos absolutos (vêm do `sharp`). Sem o `basename`
  // as imagens aparecem partidas e o link aponta para um caminho de disco.
  const rel = path.basename(e.file);
  html.push(`<a href="${esc(rel)}" target="_blank"><img src="${esc(rel)}" alt="${esc(rel)}" loading="lazy"></a>`);
  if (e.captions?.length) {
    html.push('<ul>');
    for (const c of e.captions) html.push(`<li>${esc(c)}</li>`);
    if (e.missing?.length) html.push(`<li><code>sem captura: ${esc(e.missing.join(', '))}</code></li>`);
    html.push('</ul>');
  }
  html.push('</section>');
}
html.push('</body></html>');
fs.writeFileSync(path.join(SHEETS, 'index.html'), html.join('\n'));

console.error(`\ngrelhas construídas: ${built.length} → ${SHEETS}`);
for (const b of built) console.error(`  ${path.basename(b.file).padEnd(34)} ${b.width}×${b.height} ${(b.bytes / 1024).toFixed(0)} kB${b.missing?.length ? ` (${b.missing.length} capturas em falta)` : ''}`);
console.error(`índice: ${path.join(SHEETS, 'index.html')} (${entries.length} grelhas)`);
if (args.includes('--json')) console.log(JSON.stringify(built.map((b) => ({ file: b.file, rows: b.rows, captions: b.captions })), null, 1));
