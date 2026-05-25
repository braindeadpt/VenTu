/**
 * Probe RSS feed URLs — use when evaluating new PT/international sources.
 * Usage: node scripts/news/probe-feeds.js [extra-url...]
 */
const { FEEDS } = require('./fetch-rss');

const EXTRA_CANDIDATES = [
  { name: 'Surftotal /feed', url: 'https://www.surftotal.com/feed/' },
  { name: 'Surftotal /rss', url: 'https://www.surftotal.com/rss' },
  { name: 'Liga Surf', url: 'https://www.ligasurf.pt/feed/' },
  { name: 'SAPO Desporto', url: 'https://feeds.sapo.pt/sapoDesporto/rss' },
  { name: 'Alliance Wake', url: 'https://www.alliancewake.com/feed/' },
  { name: 'FPS noticias', url: 'https://www.fps.pt/noticias/feed/' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(name, url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const items = (text.match(/<item[\s\S]*?<\/item>/gi) || []).length;
    const isRss = /<(rss|feed)\b/i.test(text.slice(0, 800));
    const ok = res.ok && isRss && items > 0;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(22)} ${res.status}  items~${items}  ${isRss ? 'xml' : 'not-rss'}`);
    return ok;
  } catch (e) {
    console.log(`✗ ${name.padEnd(22)} ERR  ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('VenTu — RSS feed probe\n');
  console.log('── Configured (fetch-rss.js) ──');
  for (const f of FEEDS) {
    await probe(`${f.source} [${f.sourceRegion}]`, f.url);
  }
  console.log('\n── Candidates (not in pipeline) ──');
  for (const c of EXTRA_CANDIDATES) {
    await probe(c.name, c.url);
  }
  const extras = process.argv.slice(2);
  if (extras.length) {
    console.log('\n── CLI extras ──');
    for (const url of extras) await probe(url, url);
  }
}

main();
