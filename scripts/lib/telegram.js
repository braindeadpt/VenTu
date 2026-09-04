/**
 * Telegram Bot API helpers (MVP alerts).
 * Env: TELEGRAM_BOT_TOKEN (optional — dry-run if missing)
 */

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

/**
 * Telegram API failure carrying the HTTP status so the caller can decide how
 * to react. `actionable` means the failure is permanent and fix-required:
 * a revoked/invalid bot token, an auth rejection, or a request-shape bug that
 * will repeat every tick. `status === 0` marks a network-level failure
 * (fetch threw: DNS/timeout/connreset) which is transient.
 */
class TelegramApiError extends Error {
  constructor(message, { status = 0, actionable = false, cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'TelegramApiError';
    this.status = status;
    this.actionable = actionable;
  }
}

// Token rejeitado: revogado, inválido, ou bot inexistente (o Telegram devolve
// 404 para tokens desconhecidos). Sempre acionável — nunca transitório.
const AUTH_STATUSES = new Set([401, 403, 404]);
// Transitório por natureza: pedidos concorrentes (409), rate-limit (429),
// timeout de leitura (408). 5xx é transitório por definição.
const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const AUTH_DESC_RE = /unauthor|forbidden|invalid.*token|not found/i;

/**
 * Decide whether a failed Telegram API response is actionable (permanent) or
 * transient. The classification lives HERE — the error carries `actionable`
 * to the caller, which never has to guess from the message text.
 */
function isActionableFailure(status, desc) {
  if (AUTH_STATUSES.has(status)) return true;
  if (AUTH_DESC_RE.test(desc)) return true;
  if (status >= 500 || TRANSIENT_STATUSES.has(status)) return false;
  // Restante (outros 4xx, ou ok:false com HTTP 200): erro permanente do
  // pedido/código — repete todos os ticks e parte o fluxo em silêncio.
  return true;
}

async function telegramApi(method, body) {
  const token = getToken();
  if (!token) return { ok: false, dryRun: true };

  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // fetch rejeitou: DNS/timeout/reset — transitório por natureza.
    throw new TelegramApiError(
      `Telegram ${method}: network error — ${cause.message}`,
      { status: 0, actionable: false, cause },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const status = res.status || 0;
    const desc = data.description || res.statusText || `HTTP ${status}`;
    throw new TelegramApiError(`Telegram ${method}: ${desc}`, {
      status,
      actionable: isActionableFailure(status, desc),
    });
  }
  return data;
}

/**
 * @param {number|string} chatId
 * @param {string} text
 * @returns {Promise<boolean>} true if sent
 */
async function sendTelegramMessage(chatId, text) {
  const token = getToken();
  if (!token) {
    console.warn('  ⚠️ TELEGRAM_BOT_TOKEN missing — dry run');
    console.log(`  → Would Telegram ${chatId}: ${text.slice(0, 80)}…`);
    return false;
  }
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  return true;
}

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getUpdateOffset(url, key) {
  const res = await fetch(
    `${url}/rest/v1/telegram_bot_state?key=eq.updates_offset&select=value`,
    { headers: supabaseHeaders(key) },
  );
  if (!res.ok) return 0;
  const rows = await res.json();
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) ? n : 0;
}

async function setUpdateOffset(url, key, offset) {
  await fetch(`${url}/rest/v1/telegram_bot_state?on_conflict=key`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key: 'updates_offset',
      value: String(offset),
      updated_at: new Date().toISOString(),
    }),
  });
}

/**
 * Poll getUpdates for /start <token> and link chat_id → user_telegram.
 * @returns {{ linked: number, processed: number }}
 */
async function processTelegramLinkUpdates(url, key) {
  const token = getToken();
  if (!token) return { linked: 0, processed: 0 };

  let offset = await getUpdateOffset(url, key);
  const data = await telegramApi('getUpdates', {
    offset: offset > 0 ? offset : undefined,
    timeout: 0,
    allowed_updates: ['message'],
  });

  const updates = data.result || [];
  let linked = 0;

  for (const upd of updates) {
    offset = Math.max(offset, upd.update_id + 1);
    const msg = upd.message;
    if (!msg?.text || !msg.chat?.id) continue;

    const m = msg.text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
    if (!m) continue;

    const startPayload = (m[1] || '').trim();
    const chatId = msg.chat.id;

    if (!startPayload) {
      await sendTelegramMessage(
        chatId,
        'VenTu — para ligar a conta, abre o link em ventu.surf/conta (Ligar Telegram).',
      );
      continue;
    }

    // Look up pending token
    const findRes = await fetch(
      `${url}/rest/v1/user_telegram?link_token=eq.${encodeURIComponent(startPayload)}&select=user_id,link_token_expires`,
      { headers: supabaseHeaders(key) },
    );
    if (!findRes.ok) continue;
    const rows = await findRes.json();
    const row = rows[0];
    if (!row) {
      await sendTelegramMessage(chatId, 'Link inválido ou expirado. Gera um novo em ventu.surf/conta.');
      continue;
    }
    if (row.link_token_expires && new Date(row.link_token_expires).getTime() < Date.now()) {
      await sendTelegramMessage(chatId, 'Link expirado. Gera um novo em ventu.surf/conta.');
      continue;
    }

    // Clear any other row that already has this chat_id
    await fetch(`${url}/rest/v1/user_telegram?chat_id=eq.${chatId}`, {
      method: 'PATCH',
      headers: {
        ...supabaseHeaders(key),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        chat_id: null,
        linked_at: null,
        updated_at: new Date().toISOString(),
      }),
    });

    const patchRes = await fetch(
      `${url}/rest/v1/user_telegram?user_id=eq.${encodeURIComponent(row.user_id)}`,
      {
        method: 'PATCH',
        headers: {
          ...supabaseHeaders(key),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          chat_id: chatId,
          link_token: null,
          link_token_expires: null,
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (patchRes.ok) {
      linked++;
      await sendTelegramMessage(
        chatId,
        'Ligado ✅\nRecebes avisos dos teus favoritos VenTu (mesmo limiar dos alertas por email).\nPara desligar: ventu.surf/conta',
      );
    }
  }

  if (updates.length > 0) {
    await setUpdateOffset(url, key, offset);
  }

  return { linked, processed: updates.length };
}

async function fetchTelegramChatId(url, key, userId) {
  const res = await fetch(
    `${url}/rest/v1/user_telegram?user_id=eq.${encodeURIComponent(userId)}&chat_id=not.is.null&select=chat_id`,
    { headers: supabaseHeaders(key) },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.chat_id ?? null;
}

module.exports = {
  sendTelegramMessage,
  processTelegramLinkUpdates,
  fetchTelegramChatId,
  getToken,
  telegramApi,
  TelegramApiError,
  isActionableFailure,
};
