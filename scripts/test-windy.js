#!/usr/bin/env node
/**
 * Test Windy API key + production embed (build-time data, no browser API).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DATA_PATH = path.join(__dirname, '../src/data/windy-webcams.json');

function loadKey() {
  if (process.env.NEXT_PUBLIC_WINDY_API_KEY) return process.env.NEXT_PUBLIC_WINDY_API_KEY.trim();
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return null;
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('NEXT_PUBLIC_WINDY_API_KEY='));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

async function testApiKey(key) {
  console.log('\n── 1. API key (server-side) ──');
  if (!key) {
    console.log('❌ No NEXT_PUBLIC_WINDY_API_KEY');
    return false;
  }
  const url = 'https://api.windy.com/webcams/api/v3/webcams?nearby=38.732,-9.472,25&limit=1&include=player,location';
  const res = await fetch(url, { headers: { 'x-windy-api-key': key } });
  const body = await res.text();
  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}: ${body.slice(0, 120)}`);
    return false;
  }
  const data = JSON.parse(body);
  const cam = data.webcams?.[0];
  const player = cam?.player?.live || cam?.player?.day;
  console.log(`✅ HTTP ${res.status} — ${data.webcams?.length ?? 0} webcam(s) near Guincho`);
  if (player) console.log(`   player URL: ${player.slice(0, 80)}...`);
  return !!player;
}

function testBuildData() {
  console.log('\n── 2. Build-time data (windy-webcams.json) ──');
  if (!fs.existsSync(DATA_PATH)) {
    console.log('❌ Missing src/data/windy-webcams.json — run npm run windy:fetch');
    return false;
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const guincho = data.spots?.guincho;
  const count = Object.keys(data.spots ?? {}).length;
  console.log(`   ${count} spots with Windy embed`);
  console.log(`   generatedAt: ${data.generatedAt}`);
  if (guincho?.playerUrl) {
    console.log(`✅ guincho → ${guincho.name || 'webcam'}`);
    return true;
  }
  console.log('❌ guincho missing — run npm run windy:fetch');
  return false;
}

async function testProduction() {
  console.log('\n── 3. Production iframe (ventu.surf) ──');
  const base = process.env.PROD_URL || 'https://ventu.surf';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let windyApiCalled = false;
  page.on('request', (r) => {
    if (r.url().includes('api.windy.com')) windyApiCalled = true;
  });

  await page.goto(`${base}/pt/spots/guincho/`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForTimeout(3000);

  const iframe = page.locator('iframe[src*="windy"], iframe[src*="webcam"]');
  const visible = (await iframe.count()) > 0 && (await iframe.first().isVisible().catch(() => false));

  if (windyApiCalled) console.log('⚠️  Browser still calls api.windy.com — old build?');
  else console.log('   No browser API call (expected with build-time data)');

  if (visible) console.log('✅ Windy iframe visible on Guincho');
  else console.log('❌ No Windy iframe — redeploy needed after windy:fetch');

  await browser.close();
  return visible;
}

async function main() {
  console.log('VenTu — Windy test\n');
  const key = loadKey();
  const apiOk = await testApiKey(key);
  const dataOk = testBuildData();
  const prodOk = await testProduction();

  console.log('\n── Summary ──');
  console.log(`API key:        ${apiOk ? '✅' : '❌'}`);
  console.log(`Build data:     ${dataOk ? '✅' : '❌'}`);
  console.log(`Production:     ${prodOk ? '✅' : '❌/pending deploy'}`);
  process.exit(apiOk && dataOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
