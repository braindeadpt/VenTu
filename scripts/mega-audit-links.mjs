#!/usr/bin/env node
/**
 * MEGA AUDIT — integridade de LINKS sobre o export inteiro.
 *
 * Percorre todos os `out/**\/index.html` e verifica, para cada `href` interno:
 *   - o destino existe no export (página ou ficheiro estático);
 *   - quando leva `#id`, esse id existe NESSE destino.
 * Também conta `href="#"`, `href=""`, `javascript:` e alvos externos.
 *
 * É diferente do `check-export-routes.js` (que verifica que as rotas do sitemap
 * existem): aqui o que se testa é o que a PÁGINA aponta, link a link, em todas
 * as páginas — incluindo os alvos que nenhum gate anterior tocava (diretório,
 * calculadoras, passaporte, conta).
 *
 * Uso: node scripts/mega-audit-links.mjs [--json <ficheiro>]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'out');
const JSON_OUT = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1]
  : null;

/** Páginas do export: `/pt/spots/guincho/` → `out/pt/spots/guincho/index.html`. */
function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Cache id→existe por ficheiro de destino. */
const idCache = new Map();
function idsOf(file) {
  if (idCache.has(file)) return idCache.get(file);
  const ids = new Set();
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  }
  idCache.set(file, ids);
  return ids;
}

/** `/pt/spots/x/` (ou `/pt/spots/x`) → ficheiro no disco, ou null. */
function resolveTarget(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (p.startsWith('/') === false) return null;
  p = p.replace(/^\/+/, '');
  const candidates = [
    path.join(ROOT, p),
    path.join(ROOT, p, 'index.html'),
    path.join(ROOT, `${p}.html`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const pages = walkHtml(ROOT).filter((f) => f.includes('/index.html'));
const problems = [];
const stats = {
  pagina: 0,
  links: 0,
  internos: 0,
  externos: 0,
  hashVazio: 0,
  javascript: 0,
  destinoEmFalta: 0,
  ancoraEmFalta: 0,
  comFragmento: 0,
};

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = '/' + path.relative(ROOT, file).replace(/\/index\.html$/, '/');
  stats.pagina++;
  const seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?href="([^"]*)"/g)) {
    const href = m[1];
    stats.links++;
    if (seen.has(href)) continue;
    seen.add(href);

    if (href === '#' || href === '') {
      stats.hashVazio++;
      problems.push({ kind: 'href-vazio', page: rel, href });
      continue;
    }
    if (/^javascript:/i.test(href)) {
      stats.javascript++;
      problems.push({ kind: 'javascript-href', page: rel, href });
      continue;
    }
    if (/^(mailto:|tel:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      stats.externos++;
      continue;
    }
    if (!href.startsWith('/')) continue; // relativo: o export não os usa
    stats.internos++;

    const [pathPart, fragment] = href.split('#');
    stats.comFragmento += fragment ? 1 : 0;
    const target = resolveTarget(pathPart || rel);
    if (!target) {
      stats.destinoEmFalta++;
      problems.push({ kind: 'destino-em-falta', page: rel, href });
      continue;
    }
    if (fragment && idsOf(target).size > 0) {
      const anchor = decodeURIComponent(fragment);
      if (!idsOf(target).has(anchor)) {
        // Âncoras `#:~:text=` (text fragments) não são ids.
        if (!fragment.includes(':~:')) {
          stats.ancoraEmFalta++;
          problems.push({ kind: 'ancora-em-falta', page: rel, href, target: '/' + path.relative(ROOT, target) });
        }
      }
    }
  }
}

const byKind = problems.reduce((acc, p) => {
  acc[p.kind] = (acc[p.kind] ?? 0) + 1;
  return acc;
}, {});

console.log('MEGA AUDIT — links');
console.log(`  páginas:            ${stats.pagina}`);
console.log(`  links (distintos por página): ${stats.links}`);
console.log(`  internos:           ${stats.internos}`);
console.log(`  externos:           ${stats.externos}`);
console.log(`  com fragmento:      ${stats.comFragmento}`);
console.log(`  href vazio/#:       ${stats.hashVazio}`);
console.log(`  javascript::        ${stats.javascript}`);
console.log(`  DESTINO EM FALTA:   ${stats.destinoEmFalta}`);
console.log(`  ÂNCORA EM FALTA:    ${stats.ancoraEmFalta}`);
console.log(`  problemas: ${JSON.stringify(byKind)}`);

for (const kind of ['destino-em-falta', 'ancora-em-falta', 'href-vazio', 'javascript-href']) {
  const list = problems.filter((p) => p.kind === kind);
  if (!list.length) continue;
  console.log(`\n── ${kind} (${list.length}) — primeiros 15:`);
  const uniq = new Map();
  for (const p of list) {
    const key = p.href;
    if (!uniq.has(key)) uniq.set(key, { p, n: 0, pages: [] });
    const e = uniq.get(key);
    e.n++;
    if (e.pages.length < 2) e.pages.push(p.page);
  }
  [...uniq.entries()].slice(0, 15).forEach(([href, v]) => {
    console.log(`   ${String(v.n).padStart(4)}× ${href}\n        em ${v.pages.join(', ')}${v.p.target ? `\n        alvo: ${v.p.target}` : ''}`);
  });
}

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify({ stats, problems }, null, 1));
  console.log(`\nJSON: ${JSON_OUT}`);
}

process.exit(stats.destinoEmFalta > 0 ? 1 : 0);
