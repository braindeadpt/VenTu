import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { fetchAllFeeds, extractField, FEEDS } = require('../../news/fetch-rss.js');
const ACTIVE_FEEDS = FEEDS.filter((f) => f.active !== false);
const { fetchFeed } = require('../../news/fetch-rss.js');
const {
  regionCounts,
  decideFeedHealthAction,
  reportFeedHealth,
  ISSUE_TITLE,
} = require('../../news/feed-health.js');

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
    expect(fetch).toHaveBeenCalledTimes(ACTIVE_FEEDS.length);
    // 2 good items × 10 feeds — the 4 bad ones were discarded by canDiscard.
    expect(items).toHaveLength(ACTIVE_FEEDS.length * 2);

    const urls = items.map((i) => i.url);
    for (const url of urls) {
      expect(url).toMatch(/^https?:/);
    }
    expect(urls).not.toContain(BAD_JS);
    expect(urls).not.toContain(BAD_DATA);
    expect(urls).not.toContain(BAD_VB);
    expect(urls.filter((u) => u === GOOD_HTTPS)).toHaveLength(ACTIVE_FEEDS.length);
    expect(urls.filter((u) => u === GOOD_HTTP)).toHaveLength(ACTIVE_FEEDS.length);
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

// ─── Saúde do pipeline: classificação de cada fonte ────────────────────────
// Antes, uma fonte com o feed vazio, um pedido falhado ou todos os itens
// descartados imprimiam o mesmo «✓ <url>: 0 items». São três estados
// diferentes e o log (e a issue de saúde) têm de os distinguir.
describe('fetchFeed — classificação de fontes', () => {
  const feed = {
    url: 'https://example.com/feed',
    source: 'Teste',
    defaultCategory: 'surf',
    sourceRegion: 'pt',
  };
  const rss = (items) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
  const item = ({ title = 'Notícia de teste', link = 'https://example.com/a', date = new Date() } = {}) =>
    `<item><title><![CDATA[${title}]]></title><link>${link}</link>` +
    `<description><![CDATA[resumo de teste]]></description>` +
    `<pubDate>${new Date(date).toUTCString()}</pubDate></item>`;

  it('fetch falhou (HTTP não 2xx) não é «feed sem itens»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const { items, report } = await fetchFeed(feed);
    expect(items).toHaveLength(0);
    expect(report.status).toBe('fetch_failed');
    expect(report.detail).toContain('HTTP 503');
  });

  it('feed sem itens: resposta 200 com zero <item>', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(rss(''), { status: 200 })));
    const { items, report } = await fetchFeed(feed);
    expect(items).toHaveLength(0);
    expect(report.status).toBe('empty_feed');
    expect(report.inFeed).toBe(0);
  });

  it('N no feed, 0 depois dos filtros — motivo idade', async () => {
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const xml = rss(item({ date: old }) + item({ date: old, link: 'https://example.com/b' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));
    const { items, report } = await fetchFeed(feed);
    expect(items).toHaveLength(0);
    expect(report.status).toBe('filtered_out');
    expect(report.inFeed).toBe(2);
    expect(report.dropped.idade).toBe(2);
    expect(report.detail).toContain('2 no feed, 0 depois dos filtros');
    expect(report.detail).toContain('idade');
  });

  it('N no feed, 0 depois dos filtros — motivo spam', async () => {
    const xml = rss(item({ title: 'Big discount on wetsuits' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));
    const { report } = await fetchFeed(feed);
    expect(report.status).toBe('filtered_out');
    expect(report.dropped.spam).toBe(1);
    expect(report.detail).toContain('spam');
  });

  it('conta duplicados dentro do feed (URL repetido, barra final normalizada)', async () => {
    const xml = rss(
      item({ link: 'https://example.com/mesma' }) +
        item({ title: 'Outra', link: 'https://example.com/mesma/' }),
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));
    const { items, report } = await fetchFeed(feed);
    expect(items).toHaveLength(1);
    expect(report.passed).toBe(1);
    expect(report.dropped.duplicados).toBe(1);
  });

  it('fonte saudável continua a marcar ok e a contar os que passaram', async () => {
    const xml = rss(item() + item({ link: 'https://example.com/b' }) + item({ title: 'Velha', link: 'https://example.com/c', date: Date.now() - 40 * 24 * 60 * 60 * 1000 }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })));
    const { items, report } = await fetchFeed(feed);
    expect(report.status).toBe('ok');
    expect(report.inFeed).toBe(3);
    expect(report.passed).toBe(2);
    expect(items).toHaveLength(2);
    expect(report.dropped.idade).toBe(1);
  });
});

describe('regionCounts — contagem do feed final por sourceRegion', () => {
  it('conta pt e intl, com a ausência a contar como intl', () => {
    expect(
      regionCounts([
        { sourceRegion: 'pt' },
        { sourceRegion: 'pt' },
        { sourceRegion: 'intl' },
        {},
        null,
      ]),
    ).toEqual({ pt: 2, intl: 3 });
  });

  it('feed vazio dá zero em ambas', () => {
    expect(regionCounts([])).toEqual({ pt: 0, intl: 0 });
  });
});

describe('feed health — abrir, comentar ou não fazer nada', () => {
  it('decide a acção a partir de pt e da existência de issue', () => {
    expect(decideFeedHealthAction({ ptCount: 0, issueNumber: null })).toBe('open');
    expect(decideFeedHealthAction({ ptCount: 0, issueNumber: 42 })).toBe('comment-empty');
    expect(decideFeedHealthAction({ ptCount: 3, issueNumber: 42 })).toBe('comment-recovered');
    expect(decideFeedHealthAction({ ptCount: 3, issueNumber: null })).toBe('none');
  });

  const silent = () => {};
  const ptItems = (n) => Array.from({ length: n }, () => ({ sourceRegion: 'pt' }));
  const intlItems = (n) => Array.from({ length: n }, () => ({ sourceRegion: 'intl' }));

  function mockApi({ openIssueNumber = null } = {}) {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
      if (method === 'GET') {
        const issues = openIssueNumber ? [{ number: openIssueNumber, title: ISSUE_TITLE }] : [];
        return new Response(JSON.stringify(issues), { status: 200 });
      }
      if (method === 'POST' && /\/issues$/.test(url)) {
        return new Response(JSON.stringify({ number: 101 }), { status: 201 });
      }
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    });
    return { fetchImpl, calls };
  }

  it('pt = 0 e sem issue: abre uma issue com o título fixo', async () => {
    const { fetchImpl, calls } = mockApi();
    const res = await reportFeedHealth({
      items: intlItems(5),
      token: 't',
      repo: 'org/repo',
      fetchImpl,
      log: silent,
    });
    expect(res.action).toBe('open');
    expect(res.counts).toEqual({ pt: 0, intl: 5 });
    const created = calls.filter((c) => c.method === 'POST' && /\/issues$/.test(c.url));
    expect(created).toHaveLength(1);
    expect(created[0].body.title).toBe(ISSUE_TITLE);
  });

  it('pt = 0 e issue já aberta: comenta, nunca duplica', async () => {
    const { fetchImpl, calls } = mockApi({ openIssueNumber: 42 });
    const res = await reportFeedHealth({
      items: intlItems(2),
      token: 't',
      repo: 'org/repo',
      fetchImpl,
      log: silent,
    });
    expect(res.action).toBe('comment-empty');
    expect(res.issueNumber).toBe(42);
    expect(calls.filter((c) => c.method === 'POST' && /\/issues$/.test(c.url))).toHaveLength(0);
    const comments = calls.filter((c) => c.method === 'POST' && /\/issues\/42\/comments$/.test(c.url));
    expect(comments).toHaveLength(1);
    expect(comments[0].body.body).toContain('Continua sem itens pt');
  });

  it('pt volta a > 0 com a issue aberta: comenta que recuperou e não a fecha', async () => {
    const { fetchImpl, calls } = mockApi({ openIssueNumber: 42 });
    const res = await reportFeedHealth({
      items: [...ptItems(2), ...intlItems(3)],
      token: 't',
      repo: 'org/repo',
      fetchImpl,
      log: silent,
    });
    expect(res.action).toBe('comment-recovered');
    const comments = calls.filter((c) => c.method === 'POST' && /\/comments$/.test(c.url));
    expect(comments).toHaveLength(1);
    expect(comments[0].body.body).toContain('voltou a ter itens pt');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('pt > 0 sem issue aberta: não faz nenhum pedido de escrita', async () => {
    const { fetchImpl, calls } = mockApi();
    const res = await reportFeedHealth({
      items: ptItems(1),
      token: 't',
      repo: 'org/repo',
      fetchImpl,
      log: silent,
    });
    expect(res.action).toBe('none');
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('sem token/repo (corrida local): não chama a API', async () => {
    const fetchImpl = vi.fn();
    const res = await reportFeedHealth({ items: intlItems(1), token: '', repo: '', fetchImpl, log: silent });
    expect(res.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ─── Fontes inactivas ──────────────────────────────────────────────────────
// ANS, FPS e Notícias do Mar deixaram de publicar (última publicação 02/11,
// 12/10 e 06/11/2026). Ficam registadas — para se ver quando voltam — mas
// `active: false` tira-as do fetch: não gastam pedido nem fingem saúde.
describe('fontes inactivas', () => {
  it('as três fontes paradas ficam registadas com active: false', () => {
    for (const source of ['ANS', 'FPS', 'Notícias do Mar']) {
      const feed = FEEDS.find((f) => f.source === source);
      expect(feed, `${source} devia continuar em FEEDS`).toBeTruthy();
      expect(feed.active).toBe(false);
    }
  });

  it('não são pedidas: o fetch só toca nas activas', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${item('Nova', GOOD_HTTPS)}</channel></rss>`;
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      return new Response(xml, { status: 200 });
    }));

    const items = await fetchAllFeeds();

    const inactiveUrls = FEEDS.filter((f) => f.active === false).map((f) => f.url);
    expect(calls).toHaveLength(ACTIVE_FEEDS.length);
    for (const url of inactiveUrls) {
      expect(calls).not.toContain(url);
    }
    expect(items).toHaveLength(ACTIVE_FEEDS.length);
  });

  it('uma fonte activa nova (Surftotal) continua a ser pedida', async () => {
    const surftotal = FEEDS.find((f) => f.source === 'Surftotal');
    expect(surftotal).toBeTruthy();
    expect(surftotal.sourceRegion).toBe('pt');
    expect(surftotal.active).not.toBe(false);
  });
});
