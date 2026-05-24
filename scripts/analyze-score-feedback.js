/**
 * VenTu — Aggregate score feedback for calibration review (Phase C4)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const res = await fetch(
    `${url}/rest/v1/score_feedback?select=spot_slug,sport,verdict,predicted_score&order=created_at.desc&limit=500`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows = await res.json();

  const agg = {};
  for (const r of rows) {
    const key = `${r.spot_slug}:${r.sport}`;
    if (!agg[key]) agg[key] = { better: 0, same: 0, worse: 0, scores: [] };
    agg[key][r.verdict]++;
    agg[key].scores.push(r.predicted_score);
  }

  console.log('📊 Score feedback summary\n');
  for (const [key, data] of Object.entries(agg)) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const total = data.better + data.same + data.worse;
    const bias = ((data.better - data.worse) / total * 100).toFixed(0);
    console.log(`  ${key}: n=${total} avg=${avg.toFixed(0)} bias=${bias}% (+better/-worse)`);
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
