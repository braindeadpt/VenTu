import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { fetchAllFeeds, extractField, FEEDS } = require('../../news/fetch-rss.js');

// S3 guarantee: the RSS pipeline must never let a non-http(s) URL through,
// even if a compromised/malicious feed serves one. This test mocks fetch and
// feeds synthetic RSS with hostile URLs through the REAL fetchAllFeeds path
// (parse → spam-filter canDiscard → isSafeHttpUrl).
const GOOD_HTTPS = 'https://example.com/good-article';
const GOOD_HTTP = 'http://example.com/legacy-article';
const BAD_JS = 'javascript:alert(1)';
const BAD_DATA = 'data:text/html,<script>alert(1)</script>';
const BAD_VB = 'vbscript:msgbox(1)';

function rssWithItems(itemsXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    ${itemsXml}
  </channel>
</rss>`;
}

function item(title, link) {
  // pubDate = now, so the discard below can only come from URL validation
  // (isTooOld never triggers on these items).
  return `<item>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[Summary for ${title}]]></description>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>`;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetch-rss URL discard (S3) with mocked fetch', () => {
  it('only http(s) URLs survive the real pipeline', async () => {
    const xml = rssWithItems(
      item('Good https', GOOD_HTTPS) +
        item('Bad javascript', BAD_JS) +
        item('Bad data', BAD_DATA) +
        item('No link', '') +
        item('Bad vbscript', BAD_VB) +
        item('Good http', GOOD_HTTP),
    );

    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await fetchAllFeeds();

    // Every configured feed returns the same synthetic feed.
    expect(fetch).toHaveBeenCalledTimes(FEEDS.length);
    // 2 good items × 10 feeds — the 4 bad ones were discarded by canDiscard.
    expect(items).toHaveLength(FEEDS.length * 2);

    const urls = items.map((i) => i.url);
    for (const url of urls) {
      expect(url).toMatch(/^https?:/);
    }
    expect(urls).not.toContain(BAD_JS);
    expect(urls).not.toContain(BAD_DATA);
    expect(urls).not.toContain(BAD_VB);
    expect(urls.filter((u) => u === GOOD_HTTPS)).toHaveLength(FEEDS.length);
    expect(urls.filter((u) => u === GOOD_HTTP)).toHaveLength(FEEDS.length);
  });

  it('returns nothing when every item has a bad or missing URL', async () => {
    const xml = rssWithItems(
      item('Only js', BAD_JS) + item('Only empty', ''),
    );

    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await fetchAllFeeds();
    expect(items).toHaveLength(0);
  });

  it('survives a non-OK feed response (returns [])', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const items = await fetchAllFeeds();
    expect(items).toHaveLength(0);
  });
});

// H1 guarantee: RSS text is the only untrusted string that reaches the JSON-LD
// <script> block. Entities must NEVER be decoded into live markup — the old
// order (strip tags → decode entities) turned `&lt;/script&gt;` into a real
// script breakout once the string was serialised into the page.
describe('fetch-rss field extraction never yields markup (H1)', () => {
  const FIELD = (content) =>
    `<item><title><![CDATA[${content}]]></title><link>https://example.com/a</link></item>`;

  it('strips entity-encoded tags that decode to </script><img onerror>', () => {
    const raw = FIELD('Swell &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; alert');
    const title = extractField(raw, 'title');

    expect(title).not.toContain('<');
    expect(title).not.toContain('>');
    expect(title).not.toContain('onerror');
    expect(title).toContain('Swell');
  });

  it('strips raw tags and entity-encoded tags in the same field', () => {
    const raw = FIELD('<b>Big</b> &lt;script&gt;steal();&lt;/script&gt; waves');
    const title = extractField(raw, 'title');

    expect(title).toBe('Big steal(); waves');
    expect(title).not.toMatch(/[<>]/);
  });

  it('still decodes the entity set it always has (behaviour unchanged)', () => {
    const raw = FIELD('Ericeira &amp; Peniche &#8212; solid &quot;swell&quot;');
    expect(extractField(raw, 'title')).toBe('Ericeira & Peniche -- solid "swell"');
  });

  it('keeps a whole fetched feed free of angle brackets', async () => {
    const xml = rssWithItems(
      item('Hostile &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;', GOOD_HTTPS),
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await fetchAllFeeds();
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.title).not.toMatch(/[<>]/);
      expect(i.summary).not.toMatch(/[<>]/);
    }
  });
});
