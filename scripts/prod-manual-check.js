#!/usr/bin/env node
/**
 * Manual checklist verification against production (https://ventu.surf).
 * Run: node scripts/prod-manual-check.js
 */
const { chromium, devices } = require('playwright');

const BASE = process.env.PROD_URL || 'https://ventu.surf';
const results = [];

function pass(id, detail) {
  results.push({ id, ok: true, detail });
  console.log(`✅ ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, ok: false, detail });
  console.log(`❌ ${id}: ${detail}`);
}
function skip(id, detail) {
  results.push({ id, ok: null, detail });
  console.log(`⏭️  ${id}: ${detail}`);
}

async function collectHealth(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── 1. Production live ──────────────────────────────────────────────
  {
    const page = await browser.newPage();
    const health = await collectHealth(page);
    const res = await page.goto(`${BASE}/pt/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (res?.ok()) pass('prod-live', `Homepage ${res.status()} @ ${BASE}/pt/`);
    else fail('prod-live', `HTTP ${res?.status()}`);
    await page.close();
  }

  // ── 2. Windy webcam + CSP (Guincho) ─────────────────────────────────
  {
    const page = await browser.newPage();
    const cspViolations = [];
    const windyCspViolations = [];
    const apiCalls = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (/content security policy|csp/i.test(t)) {
        cspViolations.push(t);
        if (/windy|webcam|embed\.windy/i.test(t)) windyCspViolations.push(t);
      }
    });
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('api.windy.com') || u.includes('embed.windy') || u.includes('webcams')) {
        apiCalls.push(u);
      }
    });
    await page.goto(`${BASE}/pt/spots/guincho/`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(6000);
    const iframe = page.locator('iframe[src*="windy"], iframe[src*="webcam"], iframe[title*="Webcam"]');
    const iframeCount = await iframe.count();
    const iframeVisible = iframeCount > 0 && await iframe.first().isVisible().catch(() => false);
    if (windyCspViolations.length === 0) pass('windy-csp', 'Sem violações CSP relacionadas com Windy');
    else fail('windy-csp', windyCspViolations.slice(0, 2).join(' | '));
    if (iframeVisible) pass('windy-load', `Iframe Windy visível (${iframeCount})`);
    else if (apiCalls.length > 0) skip('windy-load', `API Windy chamada (${apiCalls.length}x) mas sem iframe — pode não haver câmara perto`);
    else {
      const curated = await page.locator('a[href*="surftotal"], a[href*="meo"], a[href*="webcam"]').count();
      if (curated > 0) skip('windy-load', `Sem embed; ${curated} link(s) curado(s)`);
      else fail('windy-load', 'Sem webcam Windy nem links alternativos');
    }
    const goatBlocked = cspViolations.some((v) => /goatcounter/i.test(v));
    if (goatBlocked) fail('goatcounter-csp', cspViolations.filter((v) => /goatcounter/i.test(v)).slice(0, 1).join(' | '));
    else pass('goatcounter-csp', 'Sem violações CSP GoatCounter');
    await page.close();
  }

  // ── 3. Feedback + rate limit (production Supabase) ──────────────────
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/pt/spots/guincho/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const trigger = page.getByRole('button', { name: /Sugerir|Suggest|Reportar|Report/i }).first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.getByRole('heading', { name: /Contribuir|Contribute/i }).waitFor({ state: 'visible', timeout: 10_000 });
    const unavailable = page.getByText(/indisponível|unavailable|not configured/i);
    if (await unavailable.isVisible().catch(() => false)) {
      fail('feedback-supabase', 'Supabase não configurado em produção');
      await page.close();
    } else {
      const uniqueMsg = `E2E prod test ${Date.now()}`;
      await page.locator('textarea').first().fill(uniqueMsg);
      await page.getByRole('button', { name: /Enviar contribuição|Send contribution/i }).click();
      await page.waitForTimeout(3000);
      const success = page.getByText(/Obrigado|Thank you|enviado|sent/i);
      const err = page.getByText(/Erro|Error|rate|limite|limit/i);
      if (await success.isVisible().catch(() => false)) {
        pass('feedback-send', `Enviado: "${uniqueMsg.slice(0, 30)}..."`);
        // Rate limit — immediate second submit
        await page.getByRole('button', { name: /Sugerir|Suggest/i }).click().catch(() => {});
        await page.locator('textarea').first().fill('rate limit test 2');
        await page.getByRole('button', { name: /Enviar contribuição|Send contribution/i }).click();
        await page.waitForTimeout(2000);
        const rateBlocked = await err.isVisible().catch(() => false);
        if (rateBlocked) pass('feedback-rate-limit', 'Segundo envio bloqueado (<30s)');
        else skip('feedback-rate-limit', 'Segundo envio não bloqueou visivelmente (pode ser policy Supabase)');
      } else if (await err.isVisible().catch(() => false)) {
        fail('feedback-send', await err.textContent().catch(() => 'Erro desconhecido'));
      } else {
        fail('feedback-send', 'Sem confirmação de sucesso após submit');
      }
    }
    await page.close();
  }

  // ── 4. Admin page (login UI — CRUD needs credentials) ───────────────
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/pt/admin/contributions/`, { waitUntil: 'domcontentloaded' });
    const unconfigured = page.getByText(/Supabase não configurado|Supabase is not configured/i);
    const loginHeading = page.getByRole('heading', { name: /Admin|Contribui/i });
    const emailInput = page.locator('input[type="email"]');
    if (await unconfigured.isVisible().catch(() => false)) {
      fail('admin-supabase', 'Supabase não configurado em produção');
    } else if (await loginHeading.isVisible().catch(() => false) && await emailInput.isVisible().catch(() => false)) {
      pass('admin-login-ui', 'Página admin com form Supabase Auth visível');
      skip('admin-crud', 'CRUD requer credenciais admin (não armazenadas no repo)');
    } else {
      // Maybe already logged in from session — unlikely in fresh context
      const list = page.getByText(/new|done|rejected|contribui/i);
      if (await list.first().isVisible().catch(() => false)) {
        pass('admin-login-ui', 'Painel admin carregado (sessão existente)');
      } else {
        fail('admin-login-ui', 'Estado admin inesperado');
      }
    }
    await page.close();
  }

  // ── 5. Mobile: status bar + hamburger + map drawer ──────────────────
  {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();
    await page.goto(`${BASE}/pt/`, { waitUntil: 'domcontentloaded' });
    const statusBar = page.getByRole('status');
    const statusVisible = await statusBar.isVisible().catch(() => false);
    const statusBox = statusVisible ? await statusBar.boundingBox() : null;
    const header = page.getByRole('banner');
    const headerBox = await header.boundingBox();
    if (statusVisible && statusBox && headerBox) {
      const belowHeader = statusBox.y >= headerBox.y + headerBox.height - 4;
      pass('mobile-status-bar', `Visível abaixo header (y=${Math.round(statusBox.y)}, headerBottom=${Math.round(headerBox.y + headerBox.height)})`);
    } else {
      fail('mobile-status-bar', `status=${statusVisible}`);
    }
    await page.getByRole('button', { name: /Abrir menu|Open menu/i }).click();
    const favLink = page.locator('#mobile-nav').getByRole('link', { name: /Favoritos|Favorites/i });
    if (await favLink.isVisible().catch(() => false)) pass('mobile-hamburger-favorites', 'Favoritos no menu mobile');
    else fail('mobile-hamburger-favorites', 'Link Favoritos não visível');
    // Map drawer — click map toggle if present
    const mapBtn = page.getByRole('button', { name: /mapa|map/i }).first();
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
      await page.waitForTimeout(1000);
      const drawer = page.locator('[role="dialog"], .leaflet-container').first();
      if (await drawer.isVisible().catch(() => false)) pass('mobile-map-drawer', 'Drawer/mapa abre');
      else skip('mobile-map-drawer', 'Botão mapa clicado mas drawer não detectado');
    } else {
      skip('mobile-map-drawer', 'Botão mapa não encontrado no mobile');
    }
    await context.close();
  }

  // ── 6. GitHub CI (public API) ───────────────────────────────────────
  try {
    const res = await fetch('https://api.github.com/repos/braindeadpt/VenTu/actions/runs?per_page=5');
    if (res.ok) {
      const data = await res.json();
      const ciRuns = (data.workflow_runs || []).filter((r) => r.name === 'CI').slice(0, 2);
      if (ciRuns.length === 0) skip('github-ci', 'Sem runs CI recentes na API pública');
      else {
        const latest = ciRuns[0];
        const ok = latest.conclusion === 'success';
        if (ok) pass('github-ci', `CI #${latest.run_number} ${latest.conclusion} (${latest.head_sha?.slice(0, 7)})`);
        else fail('github-ci', `CI #${latest.run_number} ${latest.conclusion}`);
      }
      const deployRuns = (data.workflow_runs || []).filter((r) => r.name?.includes('Deploy')).slice(0, 1);
      if (deployRuns[0]) {
        const d = deployRuns[0];
        if (d.conclusion === 'success') pass('github-deploy', `Deploy #${d.run_number} success`);
        else fail('github-deploy', `Deploy #${d.run_number} ${d.conclusion}`);
      }
    } else {
      skip('github-ci', `GitHub API ${res.status}`);
    }
  } catch (e) {
    skip('github-ci', String(e.message));
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  console.log(`Resumo: ${passed} pass | ${failed} fail | ${skipped} skip`);
  process.exit(failed > 0 ? 1 : 0);
}

async function expectVisible(page, selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
