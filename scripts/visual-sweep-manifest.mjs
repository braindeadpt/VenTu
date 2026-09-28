#!/usr/bin/env node
/**
 * Manifesto do varrimento visual em píxeis: TODAS as rotas do export estático
 * (`out/`), com família de template, locale, slug de ficheiro e a impressão
 * digital do artefacto medido.
 *
 * Porque não se usam as listas do `discover-routes.js`: aquelas são uma
 * amostra estratificada por desenho (e não incluem /diretorio/<registo>/, as
 * calculadoras, nem os embeds). Aqui o critério é o oposto — o que existe em
 * `out/` é o que é visitado, sem amostragem nenhuma.
 *
 * Uso: `node scripts/visual-sweep-manifest.mjs [--out DIR] [--pub DIR] [--json]`
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PUB = path.resolve(flag('pub', 'out'));
const OUT = path.resolve(flag('out', '_audit/visual-sweep'));

const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];

/** Famílias de template. A ordem das regras importa: a primeira que casa ganha. */
const FAMILIES = [
  [/^\/embed\/spot\/[^/]+\/$/, 'embed-spot'],
  [/^\/(pt|en|es|de|fr)\/spots\/$/, 'spots-indice'],
  [/^\/(pt|en|es|de|fr)\/spots\/[^/]+\/$/, 'spot'],
  [/^\/(pt|en|es|de|fr)\/news\/$/, 'news-indice'],
  [/^\/(pt|en|es|de|fr)\/news\/[^/]+\/$/, 'news'],
  [/^\/(pt|en|es|de|fr)\/diretorio\/$/, 'diretorio-indice'],
  [/^\/(pt|en|es|de|fr)\/diretorio\/[^/]+\/$/, 'diretorio-registo'],
  [/^\/(pt|en|es|de|fr)\/explorar\/$/, 'explorar-indice'],
  [/^\/(pt|en|es|de|fr)\/explorar\/[^/]+\/$/, 'explorar'],
  [/^\/(pt|en|es|de|fr)\/modalidades\/$/, 'modalidades-indice'],
  [/^\/(pt|en|es|de|fr)\/modalidades\/[^/]+\/$/, 'modalidade'],
  [/^\/(pt|en|es|de|fr)\/ferramentas\/$/, 'ferramentas-indice'],
  [/^\/(pt|en|es|de|fr)\/ferramentas\/[^/]+\/$/, 'ferramenta'],
  [/^\/(pt|en|es|de|fr)\/admin\/$/, 'admin-indice'],
  [/^\/(pt|en|es|de|fr)\/admin\/[^/]+\/$/, 'admin'],
  [/^\/(pt|en|es|de|fr)\/alerts\/(confirm|unsubscribe)\/$/, 'alerts-acao'],
  [/^\/(pt|en|es|de|fr)\/alerts\/$/, 'alerts'],
  [/^\/(pt|en|es|de|fr)\/$/, 'home'],
  [/^\/(pt|en|es|de|fr)\/auth\/callback\/$/, 'auth-callback'],
  [/^\/(pt|en|es|de|fr)\/[a-z-]+\/$/, 'estatica'],
  [/^\/$/, 'raiz'],
  [/^\/_not-found\/$/, 'erro-404'],
  [/^\/404\/?$/, 'erro-404'],
];

function familyOf(route) {
  for (const [re, name] of FAMILIES) if (re.test(route)) return name;
  return 'outra';
}

/** `out/pt/spots/nazare/index.html` → `/pt/spots/nazare/` */
function routeOf(file) {
  if (file === 'index.html') return '/';
  const dir = file.replace(/index\.html$/, '');
  if (dir !== file) return `/${dir}`;
  return `/${file.replace(/\.html$/, '')}`; // /404.html → /404
}

/** Slug estável de ficheiro para uma rota (`/pt/spots/nazare/` → `pt_spots_nazare`). */
export function slugOf(route) {
  const trimmed = route.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '_raiz';
  return trimmed.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '_raiz';
}

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

if (!fs.existsSync(PUB)) {
  console.error(`❌ sem export em ${PUB} — correr \`npm run build:e2e\` antes.`);
  process.exit(1);
}

const files = walk(PUB).sort();
const routes = [];
const slugSeen = new Map();
for (const file of files) {
  const route = routeOf(file);
  // O export escreve o 404 DUAS vezes (`404.html` para `/404` e
  // `404/index.html` para `/404/`): sem desambiguar, os dois slugs colidiam e
  // uma das capturas escrevia por cima da outra.
  const slug = `${slugOf(route)}${file.endsWith('index.html') ? '' : '_ficheiro'}`;
  const clash = slugSeen.get(slug);
  if (clash && clash !== route) {
    console.error(`❌ slug colide: «${route}» e «${clash}» → ${slug}`);
    process.exit(1);
  }
  slugSeen.set(slug, route);
  const seg = route.split('/').filter(Boolean);
  const locale = LOCALES.includes(seg[0]) ? seg[0] : '—';
  routes.push({
    path: route,
    file,
    family: familyOf(route),
    locale,
    slug,
    bytes: fs.statSync(path.join(PUB, file)).size,
  });
}

const families = {};
for (const r of routes) families[r.family] = (families[r.family] ?? 0) + 1;

const locales = {};
for (const r of routes) locales[r.locale] = (locales[r.locale] ?? 0) + 1;

// Impressão digital: o varrimento tem de provar QUE artefacto mediu. A home
// /pt/ é o ficheiro maior; o hash dela + a contagem de HTMLs identifica o build.
const anchor = path.join(PUB, 'pt/index.html');
const fingerprint = {
  anchor: 'pt/index.html',
  anchorSha256: crypto.createHash('sha256').update(fs.readFileSync(anchor)).digest('hex'),
  anchorBytes: fs.statSync(anchor).size,
  anchorMtime: fs.statSync(anchor).mtime.toISOString(),
  htmlFiles: routes.length,
  totalBytes: routes.reduce((a, r) => a + r.bytes, 0),
};

fs.mkdirSync(OUT, { recursive: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  pub: PUB,
  total: routes.length,
  families,
  locales,
  fingerprint,
  routes,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

if (args.includes('--json')) {
  console.log(JSON.stringify({ total: manifest.total, families, locales, fingerprint }, null, 1));
} else {
  console.log(`manifesto: ${manifest.total} rotas de ${PUB}`);
  console.log(`  âncora ${fingerprint.anchor} sha256 ${fingerprint.anchorSha256.slice(0, 16)} · ${(fingerprint.totalBytes / 1024 / 1024).toFixed(1)} MB de HTML`);
  console.log('  famílias:');
  for (const [k, v] of Object.entries(families).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(5)}  ${k}`);
  }
  console.log(`  locales: ${Object.entries(locales).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`→ ${path.join(OUT, 'manifest.json')}`);
}
