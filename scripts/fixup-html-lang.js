/**
 * Static export ships one shared root <html lang="pt-PT"> for every locale.
 * Nested [locale] layouts cannot change the document lang attribute, and a
 * client useEffect is invisible to crawlers / no-JS. Rewrite lang in out/
 * from the path segment after `next build`.
 *
 * Idempotent. Wired into the "build" npm script after fixup-next-segment-paths.
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');

/** Keep in sync with LOCALE_HTML_LANG in src/lib/i18n.ts */
const LOCALE_HTML_LANG = {
  pt: 'pt-PT',
  en: 'en',
  es: 'es',
  de: 'de',
  fr: 'fr',
};

function walkHtml(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      walkHtml(full, out);
    } else if (e.isFile() && e.name.endsWith('.html')) {
      out.push(full);
    }
  }
}

function localeFromOutPath(filePath) {
  const rel = path.relative(OUT_DIR, filePath).split(path.sep);
  const first = rel[0];
  if (first && Object.prototype.hasOwnProperty.call(LOCALE_HTML_LANG, first)) {
    return first;
  }
  return null;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('fixup-html-lang: out/ not found — run next build first');
    process.exit(1);
  }

  const files = [];
  walkHtml(OUT_DIR, files);
  let changed = 0;
  for (const file of files) {
    const locale = localeFromOutPath(file);
    if (!locale) continue;
    const lang = LOCALE_HTML_LANG[locale];
    const html = fs.readFileSync(file, 'utf8');
    const next = html.replace(/<html(\s[^>]*)?\slang="[^"]*"/, (match) =>
      match.replace(/lang="[^"]*"/, `lang="${lang}"`),
    );
    if (next === html) continue;
    fs.writeFileSync(file, next);
    changed += 1;
  }
  console.log(`fixup-html-lang: updated lang on ${changed} HTML file(s)`);
}

main();
