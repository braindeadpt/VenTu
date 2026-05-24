/**
 * VenTu — Apply approved tip contributions to community-tips.json (Phase C3)
 *
 * Reads contributions with type=tip, status=done from Supabase.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '../public/data/community-tips.json');

const TIP_FIELD_MAP = {
  bestTide: 'bestTide',
  parking: 'parking',
  food: 'food',
  localRule: 'localRule',
};

async function fetchDoneTips() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('⚠️  No Supabase service role — keeping existing community-tips.json');
    return [];
  }

  const res = await fetch(
    `${url}/rest/v1/contributions?type=eq.tip&status=eq.done&spot_slug=not.is.null&select=spot_slug,tip_field,message,email,created_at`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function main() {
  console.log('📝 Apply community tips\n');

  let overlay = {};
  if (fs.existsSync(OUTPUT)) {
    overlay = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
  }

  const tips = await fetchDoneTips();
  for (const row of tips) {
    const slug = row.spot_slug;
    const field = TIP_FIELD_MAP[row.tip_field] || 'localRule';
    if (!slug) continue;
    if (!overlay[slug]) overlay[slug] = {};
    overlay[slug][field] = row.message;
    if (row.email) overlay[slug].contributor = row.email.split('@')[0];
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(overlay, null, 2) + '\n');
  console.log(`✅ Wrote ${Object.keys(overlay).length} spots to community-tips.json`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
