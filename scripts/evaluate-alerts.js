/**
 * VenTu — Evaluate email alerts (Phase C2 + E1c)
 *
 * E1: per-spot alert_subscriptions (legacy)
 * E1c: user_alert_prefs + user_favorites digest (one email per user)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
 */

const fs = require('fs');
const path = require('path');

const CONDITIONS_PATH = path.join(__dirname, '../public/data/conditions.json');
const SPOTS_PATH = path.join(__dirname, '../src/lib/spots.ts');
const SITE_URL = 'https://ventu.surf';
const FROM_EMAIL = process.env.RESEND_FROM || 'VenTu <alerts@ventu.surf>';
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const DIGEST_HOUR_LISBON = 7;

function lisbonDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

/**
 * Digest after DIGEST_HOUR_LISBON (inclusive). Do not require exact hour === 7:
 * GitHub Actions schedules often slip past :30, and a strict hour match would
 * skip the daily digest until the next day.
 */
function isDigestWindow() {
  return lisbonDateTimeParts().hour >= DIGEST_HOUR_LISBON;
}

function alreadySentDigestToday(lastSentAt) {
  if (!lastSentAt) return false;
  return lisbonDateTimeParts(new Date(lastSentAt)).dateKey === lisbonDateTimeParts().dateKey;
}

function normalizeAlertMode(value) {
  return value === 'immediate' ? 'immediate' : 'digest';
}

function loadSpotMaps() {
  const content = fs.readFileSync(SPOTS_PATH, 'utf-8');
  const ids = [...content.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const slugs = [...content.matchAll(/slug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const slugToId = {};
  const idToSlug = {};
  ids.forEach((id, i) => {
    slugToId[slugs[i]] = id;
    idToSlug[id] = slugs[i];
  });
  return { slugToId, idToSlug };
}

/** Same scorer as the web app (sportScore + observed wind when fresh). */
const { computeScore } = require('./lib/scoreSpotConditions');

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

async function fetchSubscriptions() {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/alert_subscriptions?active=eq.true&select=*`, {
    headers: supabaseHeaders(key),
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  return res.json();
}

async function fetchUserAlertPrefs() {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/user_alert_prefs?active=eq.true&select=*`, {
    headers: supabaseHeaders(key),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Supabase user_alert_prefs fetch failed: ${res.status}`);
  return res.json();
}

async function fetchUserFavorites(userId) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(
    `${url}/rest/v1/user_favorites?user_id=eq.${userId}&select=spot_id`,
    { headers: supabaseHeaders(key) },
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => r.spot_id);
}

/** Plain-text fallback from HTML — filters penalise HTML-only bulk mail. */
function htmlToText(html) {
  return html
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {{ unsubscribeUrl?: string }} [opts] - unsubscribeUrl adds a
 *   List-Unsubscribe header. Prefer HTTPS unsubscribe over HTML-body-only.
 *   Do not set List-Unsubscribe-Post: site is static export and cannot
 *   handle RFC 8058 one-click POST.
 */
async function sendEmail(to, subject, html, opts = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('  ⚠️ RESEND_API_KEY missing — dry run only');
    console.log(`  → Would email ${to}: ${subject}`);
    return false;
  }

  const payload = { from: FROM_EMAIL, to: [to], subject, html, text: htmlToText(html) };
  // Static export (output: 'export') — no server to handle RFC 8058 one-click POST.
  // Keep List-Unsubscribe (HTTPS link) only; do not advertise List-Unsubscribe-Post.
  if (opts.unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return true;
}

async function markLegacySent(id) {
  const { url, key } = getSupabaseConfig();
  await fetch(`${url}/rest/v1/alert_subscriptions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
  });
}

async function markUserPrefsSent(userId) {
  const { url, key } = getSupabaseConfig();
  await fetch(`${url}/rest/v1/user_alert_prefs?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

async function sendLegacyVerification(sub) {
  const isPt = sub.locale !== 'en';
  const link = `${SITE_URL}/${sub.locale || 'pt'}/alerts/confirm/?token=${sub.verify_token}`;
  const unsub = `${SITE_URL}/${sub.locale || 'pt'}/alerts/unsubscribe/?token=${sub.verify_token}`;
  const subject = isPt ? 'Confirma o teu alerta VenTu' : 'Confirm your VenTu alert';
  const html = isPt
    ? `<p>Confirma o alerta para <strong>${sub.spot_slug}</strong> (${sub.sport}, score ≥ ${sub.min_score}):</p><p><a href="${link}">Confirmar alerta</a></p>`
    : `<p>Confirm alert for <strong>${sub.spot_slug}</strong> (${sub.sport}, score ≥ ${sub.min_score}):</p><p><a href="${link}">Confirm alert</a></p>`;
  await sendEmail(sub.email, subject, html, { unsubscribeUrl: unsub });
}

async function sendUserVerification(pref, favoriteCount) {
  const isPt = pref.locale !== 'en';
  const mode = normalizeAlertMode(pref.alert_mode);
  const link = `${SITE_URL}/${pref.locale || 'pt'}/alerts/confirm/?token=${pref.verify_token}`;
  const unsub = `${SITE_URL}/${pref.locale || 'pt'}/alerts/unsubscribe/?token=${pref.verify_token}`;
  const subject = isPt
    ? 'Confirma alertas VenTu nos teus favoritos'
    : 'Confirm VenTu alerts on your favorites';
  const freqNote = isPt
    ? mode === 'immediate'
      ? 'alertas imediatos (máx. 1×/3h)'
      : 'resumo diário (~7h30)'
    : mode === 'immediate'
      ? 'immediate alerts (max once per 3h)'
      : 'daily digest (~7:30 AM)';
  const html = isPt
    ? `<p>Confirma alertas por email para <strong>${favoriteCount}</strong> spot(s) favorito(s) (${pref.sport}, score ≥ ${pref.min_score}, ${freqNote}):</p><p><a href="${link}">Confirmar alertas</a></p>`
    : `<p>Confirm email alerts for <strong>${favoriteCount}</strong> favorite spot(s) (${pref.sport}, score ≥ ${pref.min_score}, ${freqNote}):</p><p><a href="${link}">Confirm alerts</a></p>`;
  await sendEmail(pref.email, subject, html, { unsubscribeUrl: unsub });
}

async function evaluateLegacySubscriptions(slugToId, conditions) {
  const subs = await fetchSubscriptions();
  let sent = 0;

  for (const sub of subs) {
    if (!sub.verified) {
      const lastSent = sub.last_sent_at ? new Date(sub.last_sent_at).getTime() : 0;
      if (Date.now() - lastSent > 24 * 60 * 60 * 1000) {
        await sendLegacyVerification(sub);
        await markLegacySent(sub.id);
      }
      continue;
    }

    const lastSent = sub.last_sent_at ? new Date(sub.last_sent_at).getTime() : 0;
    if (Date.now() - lastSent < COOLDOWN_MS) continue;

    const spotId = slugToId[sub.spot_slug];
    if (!spotId) continue;

    const score = computeScore(spotId, sub.sport, conditions);
    if (score === null || score < sub.min_score) continue;

    const isPt = sub.locale !== 'en';
    const spotUrl = `${SITE_URL}/${sub.locale || 'pt'}/spots/${sub.spot_slug}/`;
    const unsub = `${SITE_URL}/${sub.locale || 'pt'}/alerts/unsubscribe/?token=${sub.verify_token}`;
    const subject = `VenTu — ${sub.spot_slug}: score ${score} (${sub.sport})`;
    const html = isPt
      ? `<p>Condições boas em <strong>${sub.spot_slug}</strong>!</p><p>Score ${sub.sport}: <strong>${score}</strong>/100 (limiar ${sub.min_score})</p><p><a href="${spotUrl}">Ver spot</a></p><p><a href="${unsub}">Cancelar alerta</a></p>`
      : `<p>Good conditions at <strong>${sub.spot_slug}</strong>!</p><p>${sub.sport} score: <strong>${score}</strong>/100 (threshold ${sub.min_score})</p><p><a href="${spotUrl}">View spot</a></p><p><a href="${unsub}">Unsubscribe</a></p>`;

    const ok = await sendEmail(sub.email, subject, html, { unsubscribeUrl: unsub });
    if (ok) {
      await markLegacySent(sub.id);
      sent++;
    }
  }

  return { legacyCount: subs.length, legacySent: sent };
}

async function evaluateUserFavoritesAlerts(idToSlug, conditions) {
  const prefs = await fetchUserAlertPrefs();
  let sent = 0;
  let digestSkipped = 0;
  let immediateSkipped = 0;

  for (const pref of prefs) {
    const favoriteIds = await fetchUserFavorites(pref.user_id);
    const favoriteCount = favoriteIds.length;
    const mode = normalizeAlertMode(pref.alert_mode);

    if (!pref.verified) {
      if (favoriteCount === 0) continue;
      const lastSent = pref.last_sent_at ? new Date(pref.last_sent_at).getTime() : 0;
      if (Date.now() - lastSent > 24 * 60 * 60 * 1000) {
        await sendUserVerification(pref, favoriteCount);
        await markUserPrefsSent(pref.user_id);
      }
      continue;
    }

    if (favoriteCount === 0) continue;

    const firing = [];
    for (const spotId of favoriteIds) {
      const slug = idToSlug[spotId] || spotId;
      const score = computeScore(spotId, pref.sport, conditions);
      if (score !== null && score >= pref.min_score) {
        firing.push({ slug, score });
      }
    }

    if (firing.length === 0) continue;

    const lastSent = pref.last_sent_at ? new Date(pref.last_sent_at).getTime() : 0;

    if (mode === 'digest') {
      if (!isDigestWindow()) {
        digestSkipped++;
        continue;
      }
      if (alreadySentDigestToday(pref.last_sent_at)) {
        digestSkipped++;
        continue;
      }
    } else {
      if (Date.now() - lastSent < COOLDOWN_MS) {
        immediateSkipped++;
        continue;
      }
    }

    const isPt = pref.locale !== 'en';
    const unsub = `${SITE_URL}/${pref.locale || 'pt'}/alerts/unsubscribe/?token=${pref.verify_token}`;
    const subject =
      mode === 'digest'
        ? isPt
          ? `VenTu — bom dia: ${firing.length} favorito(s) a bombar`
          : `VenTu — morning: ${firing.length} favorite(s) firing`
        : isPt
          ? `VenTu — ${firing.length} favorito(s) a bombar`
          : `VenTu — ${firing.length} favorite(s) firing`;

    const intro =
      mode === 'digest'
        ? isPt
          ? '<p>Resumo diário dos teus favoritos com condições boas agora:</p>'
          : '<p>Daily digest of your favorites with good conditions right now:</p>'
        : isPt
          ? '<p>Condições boas nos teus favoritos:</p>'
          : '<p>Good conditions on your favorites:</p>';

    const items = firing
      .map(({ slug, score }) => {
        const spotUrl = `${SITE_URL}/${pref.locale || 'pt'}/spots/${slug}/`;
        return `<li><a href="${spotUrl}"><strong>${slug}</strong></a> — score ${score}/100</li>`;
      })
      .join('');

    const html = `${intro}<ul>${items}</ul><p><a href="${unsub}">${isPt ? 'Cancelar alertas' : 'Unsubscribe'}</a></p>`;

    const ok = await sendEmail(pref.email, subject, html, { unsubscribeUrl: unsub });
    if (ok) {
      await markUserPrefsSent(pref.user_id);
      sent++;
    }
  }

  return {
    userPrefsCount: prefs.length,
    userDigestSent: sent,
    digestSkipped,
    immediateSkipped,
  };
}

async function main() {
  console.log('🔔 VenTu — Evaluate alerts\n');

  const { slugToId, idToSlug } = loadSpotMaps();
  const conditions = JSON.parse(fs.readFileSync(CONDITIONS_PATH, 'utf-8'));

  const legacy = await evaluateLegacySubscriptions(slugToId, conditions);
  const e1c = await evaluateUserFavoritesAlerts(idToSlug, conditions);

  console.log(`  Legacy subscriptions: ${legacy.legacyCount}`);
  console.log(`  User alert prefs (E1c): ${e1c.userPrefsCount}`);
  if (e1c.digestSkipped > 0) {
    console.log(`  Digest skipped (outside window or already sent today): ${e1c.digestSkipped}`);
  }
  if (e1c.immediateSkipped > 0) {
    console.log(`  Immediate skipped (3h cooldown): ${e1c.immediateSkipped}`);
  }
  console.log(`\n✅ Alerts sent: ${legacy.legacySent + e1c.userDigestSent}`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
