/**
 * End-to-end test for the Resend API key (RESEND_API_KEY) — the e-mail
 * dependency of the alert notifications (scripts/evaluate-alerts.js).
 *
 * Validates connectivity + key in one command:
 *   1. RESEND_API_KEY present (never shown).
 *   2. GET https://api.resend.com/domains with the key as Bearer — full-access
 *      keys answer 200 with the sending domains.
 *   3. If the API answers 401/403 on GET /domains (a least-privilege
 *      *sending-only* key), fall back to a POST /emails probe to
 *      `delete@resend.dev` — Resend's reserved test address (the email is
 *      discarded, never delivered to a real person). 200 → the key can send.
 *
 * Usage:
 *   RESEND_API_KEY=... node scripts/test-resend-api-key.js
 *
 * Exit codes:
 *   0  — key valid and Resend reachable (domains readable OR send probe OK).
 *   1  — key missing/invalid/expired, or the API is unreachable (see output).
 *
 * The chain logic lives in `runResendApiKeyTest()` (exported, testable with
 * a mocked fetch); the CLI wrapper maps its exit code to process.exit.
 */

const RESEND_API = 'https://api.resend.com';

/**
 * @param {object} [opts]
 * @param {string|null} [opts.apiKey] — defaults to process.env.RESEND_API_KEY
 * @param {typeof fetch} [opts.fetchImpl] — defaults to global fetch
 * @param {object} [opts.log] — logger with log/error/warn (default console)
 * @returns {Promise<number>} exit code (0 = PASS, 1 = FAIL)
 */
async function runResendApiKeyTest({
  apiKey = process.env.RESEND_API_KEY?.trim() || null,
  fetchImpl = fetch,
  log = console,
} = {}) {
  if (!apiKey) {
    log.error('❌ RESEND_API_KEY não está definida.');
    log.error('');
    log.error('   1. Regista-te gratuitamente em https://resend.com (plan free: 3 000 e-mails/mês).');
    log.error('      API Keys → cria uma key (full access, ou sending-only para menos privilégio).');
    log.error('   2. Adiciona e verifica o domínio do remetente (RESEND_FROM, ex. alerts@ventu.surf).');
    log.error('   3. Depois corre, ex.:');
    log.error('      RESEND_API_KEY=re_xxxxxxxx node scripts/test-resend-api-key.js');
    log.error('');
    log.error('   Sem a key, o evaluate-alerts corre em dry-run (nenhum e-mail sai).');
    return 1;
  }
  log.log('   ✓ RESEND_API_KEY presente (não mostra o valor)');

  // ── 1. GET /domains — probe de leitura (full-access) ───────────────────
  log.log('\n[1/2] GET /domains (valida a key na API de produção)...');
  let domainsRes;
  try {
    domainsRes = await fetchImpl(`${RESEND_API}/domains`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    log.error(`❌ Rede ao contactar a Resend API: ${err.message}`);
    return 1;
  }

  if (domainsRes.ok) {
    const body = await domainsRes.json().catch(() => null);
    const domains = Array.isArray(body?.data) ? body.data : [];
    log.log(`   ✓ API respondeu — ${domains.length} domínios autorizados.`);
    for (const d of domains.slice(0, 5)) {
      if (d?.name) log.log(`     · ${d.name} (${d?.status ?? '—'})`);
    }
    if (domains.length === 0) {
      log.warn('   ⚠️ Sem domínios — adiciona e verifica o domínio do RESEND_FROM antes de enviar.');
    }
    log.log('\n✅ PASS — a RESEND_API_KEY é válida e o serviço está acessível.');
    return 0;
  }

  // ── 2. Send probe (sending-only key) — para delete@resend.dev (descartado)
  if (domainsRes.status === 401 || domainsRes.status === 403) {
    log.log('   ⚠️ GET /domains negado (401/403) — pode ser uma key de envio restrito.');
    log.log('\n[2/2] Send probe para delete@resend.dev (endereço de teste da Resend, descartado)...');
    let sendRes;
    try {
      sendRes = await fetchImpl(`${RESEND_API}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'VenTu <alerts@ventu.surf>',
          to: ['delete@resend.dev'],
          subject: 'VenTu health check',
          text: 'Connectivity probe — no human recipient.',
        }),
      });
    } catch (err) {
      log.error(`❌ Rede ao enviar o probe: ${err.message}`);
      return 1;
    }
    if (sendRes.ok) {
      log.log('   ✓ Send probe aceite (200) — a key consegue enviar (sending-only OK).');
      log.log('\n✅ PASS — a RESEND_API_KEY é válida e o e-mail de alertas pode enviar.');
      return 0;
    }
    log.error(
      `❌ Key rejeitada pela API: GET /domains HTTP ${domainsRes.status} e send probe HTTP ${sendRes.status}.`,
    );
    log.error('   Causas comuns: key expirada/revogada, ou rede. Gera uma nova em https://resend.com/api-keys.');
    return 1;
  }

  log.error(`❌ GET /domains devolveu HTTP ${domainsRes.status} — API em baixo ou resposta inesperada.`);
  return 1;
}

async function main() {
  console.log('🔑 Resend API — key test (alertas por e-mail)\n');
  const code = await runResendApiKeyTest();
  process.exit(code);
}

// Só corre como CLI (`node scripts/test-resend-api-key.js`); nos testes
// importa-se o módulo e chama-se runResendApiKeyTest com fetch mockado.
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Erro inesperado:', err.message || err);
    process.exit(1);
  });
}

module.exports = { runResendApiKeyTest, RESEND_API };
