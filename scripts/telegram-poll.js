/**
 * Poll Telegram for /start link tokens (MVP).
 * Usage: npm run telegram:poll
 * Env: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const path = require('path');
const fs = require('fs');

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

const { processTelegramLinkUpdates, getToken } = require('./lib/telegram');

async function main() {
  loadEnvLocal();
  console.log('📱 VenTu — Telegram link poll\n');

  if (!getToken()) {
    console.warn('TELEGRAM_BOT_TOKEN missing — nothing to do');
    process.exit(0);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const result = await processTelegramLinkUpdates(url, key);
  console.log(`  Updates processed: ${result.processed}`);
  console.log(`  Accounts linked: ${result.linked}`);
  console.log('\n✅ Done');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
