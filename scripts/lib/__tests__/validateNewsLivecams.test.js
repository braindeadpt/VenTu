/**
 * Unit tests for scripts/validate-news-livecams.js guards.
 *
 * Requires the real module (guarded CLI — no execution on require). Feeds
 * malformed fixtures to the pure validateNewsLivecamsContent() and asserts
 * each guard raises its error: duplicate derived news slug (two articles on
 * one /news/ route), empty slug base, non-ASCII and duplicate livecam keys
 * (silently lost/unreachable cams). Also asserts the news derivation
 * mirrors the production copies in src/lib/news.ts and generate-sitemap.js.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateNewsLivecamsContent, slugify, newsSlug } = require('../../validate-news-livecams.js');

function newsItem(title, id) {
  return { title, id, url: 'https://example.com/x', source: 'test', publishedAt: '2026-01-01' };
}

/** Minimal src/lib/spotLivecams.ts shape: keys drive the extraction. */
function livecamsSource(entries) {
  return entries
    .map(([key, opts = {}]) => {
      const k = /^[a-z0-9-]+$/.test(key) ? key : `'${key}'`;
      return `  ${k}: {\n    url: '${opts.url || 'https://example.com/cam'}',\n    provider: 'X',\n    labelPt: 'X',\n    labelEn: 'X',\n  },`;
    })
    .join('\n');
}

const GOOD_LIVECAMS = livecamsSource([['moledo'], ['ofir'], ['supertubos']]);

describe('validate-news-livecams — URL-segment guards', () => {
  it('passes unique ASCII news slugs and livecam keys with no errors', () => {
    const { errors, newsCount, livecamCount } = validateNewsLivecamsContent({
      newsItems: [newsItem('Vento forte no Norte', 'news-1-abcdef'), newsItem('Maré viva no Algarve', 'news-2-123456')],
      livecamsSource: GOOD_LIVECAMS,
    });
    expect(errors).toEqual([]);
    expect(newsCount).toBe(2);
    expect(livecamCount).toBe(3);
  });

  it('rejects two news items whose derived slugs collide (one /news/ route)', () => {
    const { errors } = validateNewsLivecamsContent({
      newsItems: [newsItem('Vento forte no Norte', 'news-1-abcdef'), newsItem('Vento forte no Norte', 'news-1-abcdef')],
      livecamsSource: GOOD_LIVECAMS,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate derived slug "vento-forte-no-norte-abcdef"/);
    expect(errors[0]).toMatch(/would share one \/news\/ route/);
  });

  it('rejects a title that slugifies to an empty base', () => {
    const { errors } = validateNewsLivecamsContent({
      newsItems: [newsItem('!!!', 'news-1-abcdef')],
      livecamsSource: GOOD_LIVECAMS,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/slugifies to an empty base/);
  });

  it('rejects a non-ASCII livecam key (unreachable from any spot page)', () => {
    const { errors } = validateNewsLivecamsContent({
      newsItems: [newsItem('Vento', 'news-1-abcdef')],
      livecamsSource: livecamsSource([['mole-dó'], ['ofir']]),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/livecam key "mole-dó" is not ASCII\/URL-safe/);
  });

  it('rejects a duplicate livecam key (second entry silently overwrites)', () => {
    const { errors } = validateNewsLivecamsContent({
      newsItems: [newsItem('Vento', 'news-1-abcdef')],
      livecamsSource: livecamsSource([['moledo'], ['ofir'], ['moledo']]),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate livecam key "moledo"/);
  });

  it('mirrors the production news slug derivation (accents stripped, id suffix)', () => {
    expect(slugify('Praia do Garrão — Açores!')).toBe('praia-do-garrao-acores');
    expect(newsSlug(newsItem('Vento Forte no Norte', 'news-1788262316634-2'))).toBe('vento-forte-no-norte-6634-2');
  });
});
