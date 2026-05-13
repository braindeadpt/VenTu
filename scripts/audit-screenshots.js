const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  const screenshotsDir = path.join(__dirname, '../audit-screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // Start serve
  const serve = spawn('npx', ['serve', 'out', '-l', '3459'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });

  // Wait for server to start
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
    serve.stdout.on('data', (data) => {
      if (data.toString().includes('Accepting connections')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  console.log('Server running at http://localhost:3459');

  const browser = await chromium.launch();

  // Desktop viewport
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Mobile viewport
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const baseUrl = 'http://localhost:3459';

  // 1. Homepage - Desktop
  console.log('Screenshot: homepage desktop...');
  await desktop.goto(`${baseUrl}/pt/`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: path.join(screenshotsDir, '01-homepage-desktop.png'), fullPage: true });

  // 2. Homepage - Mobile
  console.log('Screenshot: homepage mobile...');
  await mobile.goto(`${baseUrl}/pt/`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: path.join(screenshotsDir, '02-homepage-mobile.png'), fullPage: true });

  // 3. Spot Detail - Desktop
  console.log('Screenshot: spot detail desktop...');
  await desktop.goto(`${baseUrl}/pt/spots/monte-gordo/`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: path.join(screenshotsDir, '03-spot-detail-desktop.png'), fullPage: true });

  // 4. Spot Detail - Mobile
  console.log('Screenshot: spot detail mobile...');
  await mobile.goto(`${baseUrl}/pt/spots/monte-gordo/`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: path.join(screenshotsDir, '04-spot-detail-mobile.png'), fullPage: true });

  // 5. Homepage mobile - map section only
  console.log('Screenshot: homepage map mobile...');
  await mobile.goto(`${baseUrl}/pt/`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.evaluate(() => window.scrollTo(0, 400));
  // Wait for Leaflet CSS + JS + tiles to load
  await mobile.waitForSelector('.leaflet-tile-loaded', { timeout: 10000 });
  await mobile.waitForTimeout(1000);
  await mobile.screenshot({ path: path.join(screenshotsDir, '05-homepage-map-mobile.png') });

  // 6. Spot detail - ForecastTable scroll test
  console.log('Screenshot: forecast table desktop...');
  await desktop.goto(`${baseUrl}/pt/spots/monte-gordo/`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);
  await desktop.evaluate(() => {
    const table = document.querySelector('[role="region"]');
    if (table) table.scrollLeft = 300;
  });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(screenshotsDir, '06-forecast-table-scrolled.png') });

  // 7. Spot detail - chat section mobile
  console.log('Screenshot: chat section mobile...');
  await mobile.goto(`${baseUrl}/pt/spots/monte-gordo/`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  // Scroll to the chat section specifically (not page bottom)
  await mobile.evaluate(() => {
    // Try to find chat heading by text content
    const headings = document.querySelectorAll('h2');
    let chatHeading = null;
    for (const h of headings) {
      if (h.textContent.includes('Conversa do spot') || h.textContent.includes('Chat')) {
        chatHeading = h;
        break;
      }
    }
    if (chatHeading) {
      chatHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else {
      // Fallback: scroll to ~65% of page height
      window.scrollTo(0, document.body.scrollHeight * 0.65);
    }
  });
  await mobile.waitForTimeout(1000);
  await mobile.screenshot({ path: path.join(screenshotsDir, '07-chat-mobile.png') });

  await browser.close();
  serve.kill();
  console.log('\n✅ Screenshots saved to audit-screenshots/');
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
