/**
 * VenTu — Evaluate email alerts (Phase C2)
 *
 * Reads verified subscriptions from Supabase, checks conditions.json scores,
 * sends emails via Resend when threshold met (max once per 3h per subscription).
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

function loadSpotSlugs() {
  const content = fs.readFileSync(SPOTS_PATH, 'utf-8');
  const ids = [...content.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const slugs = [...content.matchAll(/slug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const map = {};
  ids.forEach((id, i) => { map[slugs[i]] = id; });
  return map;
}

function computeScore(spotId, sport, conditions) {
  const c = conditions[spotId];
  if (!c) return null;
  const windKt = (c.windSpeed || 0) * 1.94384;
  const wave = c.waveHeight || 0;

  switch (sport) {
    case 'kitesurf':
      if (windKt >= 15 && windKt <= 30 && wave < 1.5) return 85;
      if (windKt >= 10) return Math.min(75, Math.round(windKt * 2.5));
      return 20;
    case 'windsurf':
      if (windKt >= 15 && windKt <= 28) return 80;
      return windKt >= 10 ? Math.round(windKt * 2) : 15;
    case 'surf':
      return Math.min(100, Math.round(wave * 15 + Math.max(0, (c.wavePeriod || 0) - 5) * 3));
    case 'foil':
      if (windKt >= 10 && windKt <= 25 && wave < 0.5) return 80;
      return 40;
    default:
      return 50;
  }
}

async function fetchSubscriptions() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const res = await fetch(`${url}/rest/v1/alert_subscriptions?active=eq.true&select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  return res.json();
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('  ⚠️ RESEND_API_KEY missing — dry run only');
    console.log(`  → Would email ${to}: ${subject}`);
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return true;
}

async function markSent(id) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${url}/rest/v1/alert_subscriptions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
  });
}

async function sendVerification(sub) {
  const isPt = sub.locale !== 'en';
  const link = `${SITE_URL}/${sub.locale || 'pt'}/alerts/confirm/?token=${sub.verify_token}`;
  const subject = isPt ? 'Confirma o teu alerta VenTu' : 'Confirm your VenTu alert';
  const html = isPt
    ? `<p>Confirma o alerta para <strong>${sub.spot_slug}</strong> (${sub.sport}, score ≥ ${sub.min_score}):</p><p><a href="${link}">Confirmar alerta</a></p>`
    : `<p>Confirm alert for <strong>${sub.spot_slug}</strong> (${sub.sport}, score ≥ ${sub.min_score}):</p><p><a href="${link}">Confirm alert</a></p>`;
  await sendEmail(sub.email, subject, html);
}

async function main() {
  console.log('🔔 VenTu — Evaluate alerts\n');

  const slugToId = loadSpotSlugs();
  const conditions = JSON.parse(fs.readFileSync(CONDITIONS_PATH, 'utf-8'));
  const subs = await fetchSubscriptions();

  console.log(`  Subscriptions: ${subs.length}`);

  let sent = 0;
  for (const sub of subs) {
    if (!sub.verified) {
      const lastSent = sub.last_sent_at ? new Date(sub.last_sent_at).getTime() : 0;
      if (Date.now() - lastSent > 24 * 60 * 60 * 1000) {
        await sendVerification(sub);
        await markSent(sub.id);
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
    const subject = isPt
      ? `VenTu — ${sub.spot_slug}: score ${score} (${sub.sport})`
      : `VenTu — ${sub.spot_slug}: score ${score} (${sub.sport})`;
    const html = isPt
      ? `<p>Condições boas em <strong>${sub.spot_slug}</strong>!</p><p>Score ${sub.sport}: <strong>${score}</strong>/100 (limiar ${sub.min_score})</p><p><a href="${spotUrl}">Ver spot</a></p><p><a href="${unsub}">Cancelar alerta</a></p>`
      : `<p>Good conditions at <strong>${sub.spot_slug}</strong>!</p><p>${sub.sport} score: <strong>${score}</strong>/100 (threshold ${sub.min_score})</p><p><a href="${spotUrl}">View spot</a></p><p><a href="${unsub}">Unsubscribe</a></p>`;

    const ok = await sendEmail(sub.email, subject, html);
    if (ok) {
      await markSent(sub.id);
      sent++;
    }
  }

  console.log(`\n✅ Alerts sent: ${sent}`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
