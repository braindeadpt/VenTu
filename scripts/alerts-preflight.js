/**
 * VenTu — Preflight checks for email alerts (E1)
 * Usage: npm run alerts:preflight
 */
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  return false;
}

async function main() {
  console.log('🔔 VenTu — Alerts preflight\n');
  loadEnvLocal();

  let pass = true;

  const sqlPath = path.join(__dirname, '../supabase-alerts.sql');
  if (fs.existsSync(sqlPath)) ok('supabase-alerts.sql present');
  else pass = fail('Missing supabase-alerts.sql');

  const conditionsPath = path.join(__dirname, '../public/data/conditions.json');
  if (fs.existsSync(conditionsPath)) {
    const n = Object.keys(JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'))).length;
    ok(`conditions.json (${n} spots)`);
  } else {
    pass = fail('Missing public/data/conditions.json');
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'VenTu <alerts@ventu.surf>';

  if (url) ok(`SUPABASE_URL set (${url.slice(0, 32)}…)`);
  else pass = fail('SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL not set');

  if (serviceKey) ok('SUPABASE_SERVICE_ROLE_KEY set');
  else pass = fail('SUPABASE_SERVICE_ROLE_KEY not set (required for evaluate-alerts workflow)');

  if (resendKey) ok('RESEND_API_KEY set');
  else warn('RESEND_API_KEY not set — evaluate-alerts will dry-run only');

  ok(`RESEND_FROM default: ${from}`);

  if (url && serviceKey) {
    try {
      const res = await fetch(`${url}/rest/v1/alert_subscriptions?select=id&limit=1`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (res.ok) {
        ok('Supabase table alert_subscriptions reachable');
      } else if (res.status === 404 || res.status === 406) {
        pass = fail(`Supabase returned ${res.status} — run supabase-alerts.sql in SQL Editor`);
      } else {
        pass = fail(`Supabase check failed: HTTP ${res.status}`);
      }
    } catch (e) {
      pass = fail(`Supabase request error: ${e.message}`);
    }
  }

  const workflow = path.join(__dirname, '../.github/workflows/evaluate-alerts.yml');
  if (fs.existsSync(workflow)) ok('evaluate-alerts.yml workflow present');
  else pass = fail('Missing .github/workflows/evaluate-alerts.yml');

  console.log('');
  if (pass) {
    console.log('✅ Preflight OK — configure GitHub Secrets and run workflow_dispatch to finish E1.');
    process.exit(0);
  } else {
    console.log('❌ Preflight failed — fix items above before enabling production alerts.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
