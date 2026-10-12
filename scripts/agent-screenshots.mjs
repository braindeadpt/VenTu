#!/usr/bin/env node
/**
 * agent-screenshots.mjs — screenshots 390 px (mobile) e 1440 px (desktop) de
 * rotas do export estático, para revisão visual de PRs de agentes.
 *
 * Uso:  node scripts/agent-screenshots.mjs --out agent-shots /pt/ /pt/mapa/
 * Pré-requisitos: `out/` construído e Playwright Chromium instalado.
 * Serve `out/` com `npx serve` numa porta livre; nada sai para a rede além
 * do que a própria página pede.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
let out = 'agent-shots';
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else routes.push(args[i]);
}
if (!routes.length) routes.push('/pt/');
mkdirSync(out, { recursive: true });

const PORT = 4791;
const server = spawn('npx', ['serve', 'out', '-l', String(PORT)], { stdio: 'ignore' });
const base = `http://127.0.0.1:${PORT}`;

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/'); if (r.ok || r.status === 404) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('serve não arrancou');
}

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '1440', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

let failed = 0;
try {
  await waitUp();
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor,
      reducedMotion: 'reduce', locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    });
    for (const route of routes) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
      try {
        await page.goto(base + route, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(out, `${slug}-${vp.name}-top.png`) });
        await page.screenshot({ path: join(out, `${slug}-${vp.name}-full.png`), fullPage: true });
        console.log(`ok ${vp.name} ${route}${errors.length ? `  (${errors.length} erros JS)` : ''}`);
        if (errors.length) console.log('   ' + errors.slice(0, 3).join('\n   '));
      } catch (e) {
        failed++;
        console.log(`FALHOU ${vp.name} ${route}: ${e.message}`);
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
