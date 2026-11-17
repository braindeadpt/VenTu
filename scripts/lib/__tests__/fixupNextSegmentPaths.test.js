/**
 * Unit tests for the <html lang> rewrite in scripts/fixup-next-segment-paths.js
 * (issue #457: the shared static root layout bakes lang="pt-PT" into every
 * locale's pages, so the fixup must rewrite the attribute per locale in every
 * baked .html — not only the locale index).
 */
import { describe, it, expect } from 'vitest';
import { fixHtmlLang, fixHtmlLangPerLocale } from '../../fixup-next-segment-paths';

const fs = require('fs');
const os = require('os');
const path = require('path');

function makeOut(structure) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ventu-fixup-'));
  for (const [rel, content] of Object.entries(structure)) {
    const file = path.join(out, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return out;
}

function readOut(out, rel) {
  return fs.readFileSync(path.join(out, ...rel.split('/')), 'utf8');
}

describe('fixHtmlLang', () => {
  it('rewrites only the lang value — everything else stays byte-identical', () => {
    const html =
      '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"></head>' +
      '<body><div id="app">nazaré ã ç õ</div></body></html>';
    expect(fixHtmlLang(html, 'en')).toBe(html.replace('lang="pt-PT"', 'lang="en"'));
  });

  it('does not insert extra whitespace when lang is the first attribute', () => {
    expect(fixHtmlLang('<html lang="pt-PT"><body></body></html>', 'es')).toBe(
      '<html lang="es"><body></body></html>',
    );
  });

  it('keeps the attributes around lang untouched', () => {
    expect(
      fixHtmlLang('<html class="a" lang="pt-PT" dir="ltr"><body></body></html>', 'de'),
    ).toBe('<html class="a" lang="de" dir="ltr"><body></body></html>');
  });

  it('never rewrites an xml:lang attribute', () => {
    const html = '<html xml:lang="pt-PT"><body></body></html>';
    expect(fixHtmlLang(html, 'en')).toBe(html);
  });

  it('leaves an <html> tag without lang alone', () => {
    const html = '<html class="a"><body></body></html>';
    expect(fixHtmlLang(html, 'en')).toBe(html);
  });
});

describe('fixHtmlLangPerLocale', () => {
  it('rewrites a nested en page from pt-PT to en, byte-identical otherwise', () => {
    const nested =
      '<!doctype html><html lang="pt-PT"><head><title>Nazaré</title></head>' +
      '<body><main><h1>Ondas</h1><p>conteúdo ã ç õ</p></main></body></html>';
    const out = makeOut({ 'en/spots/nazare/index.html': nested });

    fixHtmlLangPerLocale(out);

    const fixed = readOut(out, 'en/spots/nazare/index.html');
    expect(fixed).toBe(nested.replace('lang="pt-PT"', 'lang="en"'));
    expect(fixed.startsWith('<!doctype html><html lang="en">')).toBe(true);
  });

  it('rewrites every locale directory and only .html files', () => {
    const html = (lang) => `<html lang="${lang}"><body>x</body></html>`;
    const out = makeOut({
      'en/index.html': html('pt-PT'),
      'en/mapa/index.html': html('pt-PT'),
      'fr/about/index.html': html('pt-PT'),
      'es/mapa/index.html': html('pt-PT'),
      'de/index.html': html('pt-PT'),
      'en/spots/x/payload.txt': html('pt-PT'),
    });

    fixHtmlLangPerLocale(out);

    expect(readOut(out, 'en/index.html')).toBe(html('en'));
    expect(readOut(out, 'en/mapa/index.html')).toBe(html('en'));
    expect(readOut(out, 'fr/about/index.html')).toBe(html('fr'));
    expect(readOut(out, 'es/mapa/index.html')).toBe(html('es'));
    expect(readOut(out, 'de/index.html')).toBe(html('de'));
    // Segment-cache payloads and any other non-HTML file are never touched.
    expect(readOut(out, 'en/spots/x/payload.txt')).toBe(html('pt-PT'));
  });

  it('is idempotent and leaves already-correct files untouched', () => {
    const correct = '<html lang="fr"><body>x</body></html>';
    const out = makeOut({ 'fr/index.html': correct });

    fixHtmlLangPerLocale(out);
    fixHtmlLangPerLocale(out);

    expect(readOut(out, 'fr/index.html')).toBe(correct);
  });
});
