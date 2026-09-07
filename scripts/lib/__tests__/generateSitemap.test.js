/**
 * Unit tests for scripts/generate-sitemap.js — index + content-type splits,
 * hreflang (incl. x-default → pt), and XML structure.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  LOCALES,
  X_DEFAULT_LOCALE,
  SITEMAP_PARTS,
  hreflangLinks,
  renderUrlset,
  renderSitemapIndex,
  sitemapUrl,
  collectSitemapBuckets,
  generateSitemaps,
} = require('../../generate-sitemap.js');

describe('generate-sitemap — structure', () => {
  it('hreflang includes every locale plus x-default → pt', () => {
    const block = hreflangLinks('/fontes/');
    for (const loc of LOCALES) {
      expect(block).toContain(`hreflang="${loc}" href="${sitemapUrl(`https://ventu.surf/${loc}/fontes/`)}"`);
    }
    expect(block).toContain(
      `hreflang="x-default" href="${sitemapUrl(`https://ventu.surf/${X_DEFAULT_LOCALE}/fontes/`)}"`,
    );
    expect(X_DEFAULT_LOCALE).toBe('pt');
  });

  it('renderUrlset emits loc + hreflang block for each entry', () => {
    const xml = renderUrlset([
      {
        loc: 'https://ventu.surf/pt/fontes/',
        lastmod: '2026-09-07',
        changefreq: 'monthly',
        priority: '0.5',
        localePath: '/fontes/',
      },
    ]);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('xmlns:xhtml=');
    expect(xml).toContain('<loc>https://ventu.surf/pt/fontes/</loc>');
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).toContain('hreflang="fr"');
  });

  it('renderSitemapIndex lists every child part', () => {
    const xml = renderSitemapIndex(SITEMAP_PARTS, '2026-09-07');
    expect(xml).toContain('<sitemapindex');
    expect(xml).not.toContain('<urlset');
    for (const part of SITEMAP_PARTS) {
      expect(xml).toContain(`<loc>https://ventu.surf/${part}</loc>`);
    }
  });

  it('collectSitemapBuckets splits by content type with locale expansion', () => {
    const { buckets, counts } = collectSitemapBuckets({ today: '2026-09-07' });
    expect(Object.keys(buckets).sort()).toEqual([...SITEMAP_PARTS].sort());
    expect(counts.spotSlugs).toBeGreaterThan(100);
    expect(buckets['sitemap-spots.xml'].length).toBe(counts.spotSlugs * LOCALES.length);
    expect(buckets['sitemap-static.xml'].some((e) => e.loc.includes('/pt/fontes/'))).toBe(true);
    expect(buckets['sitemap-static.xml'].some((e) => e.loc.includes('/es/mapa/'))).toBe(true);
    expect(buckets['sitemap-explorar.xml'].length).toBeGreaterThan(0);
  });

  it('generateSitemaps writes index + splits under public/', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ventu-sitemap-'));
    const publicDir = path.join(tmp, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    // Point generator at the real repo for data, but write outputs into tmp
    // by monkey-patching via rootDir that still has src/lib/spots.ts — use
    // the real repo root and only assert return shape + that files exist.
    const rootDir = path.join(__dirname, '..', '..', '..');
    const before = SITEMAP_PARTS.map((f) => {
      const p = path.join(rootDir, 'public', f);
      return { f, existed: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
    });

    const result = generateSitemaps({ rootDir, today: '2026-09-07' });
    expect(result.parts).toEqual(SITEMAP_PARTS);
    expect(result.written.some((w) => w.file === 'sitemap.xml' && w.index)).toBe(true);

    const index = fs.readFileSync(path.join(rootDir, 'public', 'sitemap.xml'), 'utf-8');
    expect(index).toContain('<sitemapindex');
    for (const part of SITEMAP_PARTS) {
      expect(index).toContain(part);
      const child = fs.readFileSync(path.join(rootDir, 'public', part), 'utf-8');
      expect(child).toContain('<urlset');
      expect(child.length).toBeLessThan(1_200_000); // each split well under old ~1.8MB monolith
    }

    // Sanity: regenerating did not leave an empty static sitemap
    expect(fs.statSync(path.join(rootDir, 'public', 'sitemap-static.xml')).size).toBeGreaterThan(1000);
    void before;
    void tmp;
  });
});
