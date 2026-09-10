/**
 * Unit tests for scripts/check-export-routes.js — the browserless route
 * validator that replaced the HTTP half of the per-push route audit.
 *
 * Pure core only (no filesystem): loc parsing/decoding, set comparison, and
 * page classification are exercised against strings/maps so the CI step's
 * logic is locked without a build.
 */
import { describe, it, expect } from 'vitest';
import {
  sitemapLocToRelPath,
  parseSitemapLocs,
  checkExportRoutes,
  classifyBakedPage,
  NOINDEX_ROUTE_PATHS,
  LOCALES,
  MIN_HTML_BYTES,
} from '../../check-export-routes';

describe('sitemapLocToRelPath', () => {
  it('converts a sitemap URL into the baked relative path', () => {
    expect(sitemapLocToRelPath('https://ventu.surf/pt/spots/guincho/')).toBe(
      'pt/spots/guincho/index.html',
    );
  });

  it('percent-decodes non-ASCII segments (export writes real filenames)', () => {
    // The garrão class: the sitemap lists the encoded form.
    expect(sitemapLocToRelPath('https://ventu.surf/pt/spots/garr%C3%A3o/')).toBe(
      'pt/spots/garrão/index.html',
    );
  });

  it('strips trailing slashes from nested and root routes', () => {
    expect(sitemapLocToRelPath('https://ventu.surf/pt/mapa/')).toBe('pt/mapa/index.html');
    expect(sitemapLocToRelPath('https://ventu.surf/pt/')).toBe('pt/index.html');
  });

  it('rejects foreign origins and traversal attempts', () => {
    expect(sitemapLocToRelPath('https://evil.example/pt/')).toBeNull();
    expect(sitemapLocToRelPath('https://ventu.surf/')).toBeNull();
    expect(sitemapLocToRelPath('https://ventu.surf/pt/../secrets/')).toBeNull();
  });
});

describe('parseSitemapLocs', () => {
  it('extracts every <loc> as a relative route path', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url><loc>https://ventu.surf/pt/</loc></url>',
      '  <url><loc>https://ventu.surf/en/spots/garrao/</loc></url>',
      '</urlset>',
    ].join('\n');
    expect(parseSitemapLocs(xml)).toEqual(['pt/index.html', 'en/spots/garrao/index.html']);
  });
});

describe('checkExportRoutes', () => {
  const expected = ['pt/index.html', 'pt/spots/guincho/index.html', 'en/index.html'];

  it('reports nothing when the export matches expectations', () => {
    const r = checkExportRoutes({ expected, baked: expected });
    expect(r).toEqual({ missing: [], extra: [], notFound: [], size: [] });
  });

  it('names missing routes in expectation order', () => {
    const r = checkExportRoutes({
      expected,
      baked: ['pt/index.html', 'en/index.html'],
    });
    expect(r.missing).toEqual(['pt/spots/guincho/index.html']);
  });

  it('names extra baked routes unknown to the expectation set', () => {
    const r = checkExportRoutes({
      expected,
      baked: [...expected, 'pt/_orphan/index.html'],
    });
    expect(r.extra).toEqual(['pt/_orphan/index.html']);
  });

  it('splits mis-baked pages by verdict class', () => {
    const baked = [...expected, 'pt/dropped/index.html', 'pt/tiny/index.html'];
    const bakedBad = new Map([
      ['pt/dropped/index.html', 'not-found'],
      ['pt/tiny/index.html', 'size'],
    ]);
    const r = checkExportRoutes({ expected, baked, bakedBad });
    expect(r.notFound).toEqual(['pt/dropped/index.html']);
    expect(r.size).toEqual(['pt/tiny/index.html']);
  });
});

describe('classifyBakedPage', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  function withFile(bytes) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventu-export-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, bytes);
    return file;
  }

  it('flags pages below the size floor before content checks', () => {
    const file = withFile(Buffer.from('<html></html>', 'utf8'));
    expect(classifyBakedPage(file, file.length < MIN_HTML_BYTES ? file.length : 10)).toBe('size');
  });

  it('flags the localized not-found page even when large enough', () => {
    const html = Buffer.from(
      `<html><body><h1>${'x'.repeat(MIN_HTML_BYTES)} Página não encontrada</h1></body></html>`,
      'utf8',
    );
    const file = withFile(html);
    expect(classifyBakedPage(file, html.length)).toBe('not-found');
  });

  it('flags the English not-found heading too', () => {
    const html = Buffer.from(
      `<html><body><h1>${'y'.repeat(MIN_HTML_BYTES)} Page not found</h1></body></html>`,
      'utf8',
    );
    const file = withFile(html);
    expect(classifyBakedPage(file, html.length)).toBe('not-found');
  });

  it('passes a healthy baked page', () => {
    const html = Buffer.from(
      `<html><body>${'z'.repeat(MIN_HTML_BYTES + 10)}</body></html>`,
      'utf8',
    );
    const file = withFile(html);
    expect(classifyBakedPage(file, html.length)).toBeNull();
  });
});

describe('allowlist contract', () => {
  it('covers every locale for each noindex utility route', () => {
    // Guard the invariant the CLI relies on: each path expands ×5 locales,
    // and the list keeps the one-shot alert e-mail landings covered.
    expect(NOINDEX_ROUTE_PATHS).toContain('/alerts/confirm/');
    expect(NOINDEX_ROUTE_PATHS).toContain('/alerts/unsubscribe/');
    expect(NOINDEX_ROUTE_PATHS.length).toBeGreaterThanOrEqual(9);
    expect(LOCALES).toEqual(['pt', 'en', 'es', 'de', 'fr']);
  });
});
