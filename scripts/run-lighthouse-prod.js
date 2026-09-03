/**
 * Lighthouse on static export (run `npm run build` first).
 * Usage: npm run lighthouse:prod
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { evaluateLighthouseBudgets } = require('./lib/lighthouseBudgets');

const PORT = process.env.LIGHTHOUSE_PORT || '4180';
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = [
  { path: '/pt/', name: 'home' },
  { path: '/pt/mapa/', name: 'mapa' },
  { path: '/pt/spots/guincho/', name: 'spot-guincho' },
];

const OUT_DIR = path.join(__dirname, '..', 'out');

function waitForServer(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          n += 1;
          if (n >= attempts) reject(new Error(`Server not ready: ${url}`));
          else setTimeout(tick, 500);
        });
    };
    tick();
  });
}

function runLighthouse(url, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      '--preset=desktop',
      '--output=json',
      `--output-path=${outFile}`,
      '--quiet',
      '--chrome-flags=--headless=new',
      '--only-categories=performance,accessibility,seo',
      '--max-wait-for-load=120000',
    ];
    const child = spawn('npx', ['lighthouse', ...args], {
      shell: true,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`lighthouse exited ${code} for ${url}`));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(outFile, 'utf8')));
      } catch (e) {
        reject(e);
      } finally {
        try {
          fs.unlinkSync(outFile);
        } catch {
          /* ignore */
        }
      }
    });
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('Missing out/ — run npm run build first');
    process.exit(1);
  }

  const serve = spawn('npx', ['serve', 'out', '-l', PORT], {
    shell: true,
    stdio: 'ignore',
    detached: true,
  });

  try {
    await waitForServer(`${BASE}/pt/`);
    const summary = [];
    const allBreaches = [];

    for (const route of ROUTES) {
      const tmp = path.join(__dirname, '..', `lighthouse-${route.name}.tmp.json`);
      const report = await runLighthouse(`${BASE}${route.path}`, tmp);
      const cats = report.categories || {};
      const row = {
        route: route.name,
        path: route.path,
        performance: Math.round((cats.performance?.score ?? 0) * 100),
        accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
        seo: Math.round((cats.seo?.score ?? 0) * 100),
      };
      summary.push(row);
      console.log(
        `[${route.name}] Perf ${row.performance} | A11y ${row.accessibility} | SEO ${row.seo}`,
      );

      const { breaches, tracked } = evaluateLighthouseBudgets(report);
      for (const breach of breaches) allBreaches.push(`[${route.name}] ${breach}`);
      for (const m of tracked) {
        console.log(
          `[${route.name}] tracked: ${m.id}=${m.value} (not gated — hydration CLS fix tracked separately)`,
        );
      }
    }

    const worst = {
      seo: Math.min(...summary.map((r) => r.seo)),
      accessibility: Math.min(...summary.map((r) => r.accessibility)),
      performance: Math.min(...summary.map((r) => r.performance)),
    };

    console.log('\nWorst scores across routes:', worst);

    if (allBreaches.length > 0) {
      console.warn(`Budget breaches (${allBreaches.length}):`);
      for (const b of allBreaches) console.warn(`  - ${b}`);
      process.exit(1);
    }
    console.log('All Lighthouse budgets met.');
  } finally {
    try {
      process.kill(-serve.pid);
    } catch {
      serve.kill();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
