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

const {
  processTelegramLinkUpdates,
  getToken,
  TelegramApiError,
} = require('./lib/telegram');

async function main() {
  loadEnvLocal();
  console.log('📱 VenTu — Telegram link poll\n');

  if (!getToken()) {
    console.log(
      '⏭️  TELEGRAM_BOT_TOKEN missing — skip poll.\n' +
        '   Add it to .env.local (local) and GitHub Actions secret TELEGRAM_BOT_TOKEN.',
    );
    process.exit(0);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      '⏭️  Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — skip poll.',
    );
    process.exit(0);
  }

  const result = await processTelegramLinkUpdates(url, key);
  console.log(`  Updates processed: ${result.processed}`);
  console.log(`  Accounts linked: ${result.linked}`);
  console.log('\n✅ Done');
}

/**
 * Exit code for a poll failure — classify, don't flatten:
 *  - ACTIONABLE (401/403/404 token revogado, ok:false auth, erro permanente de
 *    pedido): exit 1 — o Actions fica vermelho e o fluxo de ligação não parte
 *    em silêncio (mesma política do fetch-ih-buoys: falhar cedo no acionável).
 *  - TRANSITÓRIO (5xx, 429, timeouts, rede/DNS): exit 0 — um cron de 5 min
 *    não deve acordar ninguém por um 502; o próximo tick volta a tentar.
 *  - Erros sem classificação (ex.: bug de código não relacionado com a API):
 *    exit 0 com log distinto, para o tick continuar — mas nunca em silêncio.
 */
function exitCodeForError(err) {
  return err instanceof TelegramApiError && err.actionable ? 1 : 0;
}

if (require.main === module) {
  main().catch((e) => {
    const code = exitCodeForError(e);
    if (code === 1) {
      console.error('❌ Permanent error — fix required:', e.message);
    } else if (e instanceof TelegramApiError) {
      console.warn('⚠️ Transient error — skipping this tick:', e.message);
    } else {
      console.warn('⚠️ Unclassified error — skipping this tick:', e.message);
    }
    process.exit(code);
  });
}

module.exports = { main, exitCodeForError };
