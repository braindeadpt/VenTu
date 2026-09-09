/* Hydration-latency metric: time from navigation start to the
 * HydrationBeacon attribute (html[data-hydrated="true"]).
 *
 * Measurement: a MutationObserver installed by addInitScript (runs before
 * any page script) records performance.now() the moment the attribute is
 * set. The beacon fires in a useEffect after the shell commits, so this
 * is "when is the shell actually interactive", not "when did JS parse".
 *
 * Usage:
 *   node scripts/measure-hydration-latency.mjs [--base URL] [--runs N]
 *   node scripts/measure-hydration-latency.mjs --serve out --runs 3   (self-hosts out/)
 * Prints one JSON object with per-route stats (p50/p90/max in ms).
 */
import { chromium, devices } from 'playwright';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/** Minimal static server for the built out/ — mirrors `serve out` closely
 * enough for timing (in-page beacon ms is server-independent anyway). */
function serveStatic(root) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = join(root, normalize(urlPath).replace(/^([.][.][/\\])+/, ''));
      if (urlPath.endsWith('/') || !extname(file)) file = join(file, 'index.html');
      if (!existsSync(file) || !statSync(file).isFile()) {
        // SPA-ish fallback for extensionless paths
        const alt = join(root, normalize(urlPath), 'index.html');
        if (existsSync(alt)) file = alt;
        else {
          res.writeHead(404).end('not found');
          return;
        }
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const SERVE_DIR = get('--serve', null);
const RUNS = Number(get('--runs', '5'));

let internalServer = null;
let BASE = get('--base', null);
if (SERVE_DIR) {
  internalServer = await serveStatic(SERVE_DIR);
  const { port } = internalServer.address();
  BASE = `http://127.0.0.1:${port}`;
  console.error(`serving ${SERVE_DIR} on ${BASE}`);
}
if (!BASE) {
  console.error('error: pass --base URL or --serve DIR');
  process.exit(2);
}

const ROUTES = ['/', '/spots/', '/ferramentas/calculadora-kite/'];
const LOCALES = ['pt', 'en'];
const MOBILE = { ...devices['iPhone 13'], locale: 'pt-PT' };
const DESKTOP = { viewport: { width: 1440, height: 900 }, locale: 'pt-PT' };

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
  return { n: s.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
};

const browser = await chromium.launch();
const results = {};

for (const locale of LOCALES) {
  for (const route of ROUTES) {
    const key = `${locale}${route}`;
    const samples = [];
    for (let run = 0; run < RUNS; run++) {
      for (const [label, ctxOpts] of [
        ['mobile', MOBILE],
        ['desktop', DESKTOP],
      ]) {
        const ctx = await browser.newContext(ctxOpts);
        const page = await ctx.newPage();
        await page.addInitScript(() => {
          // Runs before any page script, in the isolated world: record the
          // attribute timestamp ON THE DOM (html[data-beacon-ms]) so the
          // main world (waitForFunction) can read it cross-world. Observe
          // `document` — documentElement does not exist yet at init time.
          const obs = new MutationObserver(() => {
            const html = document.documentElement;
            if (
              html &&
              html.getAttribute('data-hydrated') === 'true' &&
              html.getAttribute('data-beacon-ms') === null
            ) {
              html.setAttribute('data-beacon-ms', String(Math.round(performance.now())));
              obs.disconnect();
            }
          });
          obs.observe(document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-hydrated'],
          });
        });
        const t0 = Date.now();
        await page.goto(BASE + '/' + locale + route, { waitUntil: 'commit', timeout: 60_000 });
        await page.waitForFunction(
          () => document.documentElement.getAttribute('data-beacon-ms') !== null,
          null,
          { timeout: 60_000 }
        );
        const beaconAt = await page.evaluate(() =>
          Number(document.documentElement.getAttribute('data-beacon-ms'))
        );
        const wallTillBeacon = Date.now() - t0; // includes network on cold loads
        samples.push({ inPageMs: Math.round(beaconAt), wallMs: wallTillBeacon, viewport: label });
        await ctx.close();
      }
    }
    const inPage = stats(samples.map((s) => s.inPageMs));
    const wall = stats(samples.map((s) => s.wallMs));
    results[key] = { inPageBeaconMs: inPage, wallTillBeaconMs: wall, samples };
  }
}

await browser.close();
if (internalServer) internalServer.close();
// Print to stdout (greppable via `gh run view --log`) — callers can tee to
// $GITHUB_STEP_SUMMARY themselves; do not rely on redirect-only output.
console.log(
  JSON.stringify(
    {
      base: BASE,
      runsPerRoute: RUNS,
      note: 'inPageBeaconMs = performance.now() when data-hydrated lands (page-relative); wallTillBeaconMs = Date.now() around goto+wait',
      results,
    },
    null,
    1
  )
);
