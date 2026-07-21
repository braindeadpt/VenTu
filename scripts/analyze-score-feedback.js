/**
 * VenTu — Aggregate score feedback for calibration review (Phase C4b)
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Loads .env.local from repo root when present.
 *
 * Usage:
 *   npm run scores:analyze
 *   npm run scores:analyze -- --json   # machine-readable summary
 *
 * Does NOT change sportScore weights — review output before editing.
 */

const { loadEnvLocal } = require('./lib/loadEnvLocal');

const MIN_N_PER_SPORT = 30;
const MIN_N_PER_SPOT = 5;
/** |bias| above this (%) with enough n → review candidate */
const BIAS_FLAG_PCT = 25;

/**
 * @typedef {{ better: number; same: number; worse: number; scores: number[] }} Bucket
 * @typedef {{
 *   key: string;
 *   spotSlug: string;
 *   sport: string;
 *   n: number;
 *   avgPredicted: number;
 *   biasPct: number;
 *   better: number;
 *   same: number;
 *   worse: number;
 * }} AggRow
 */

/**
 * @param {Array<{ spot_slug?: string; sport?: string; verdict?: string; predicted_score?: number }>} rows
 * @returns {AggRow[]}
 */
function aggregateFeedback(rows) {
  /** @type {Record<string, Bucket>} */
  const agg = {};
  for (const r of rows) {
    const spotSlug = r.spot_slug || '?';
    const sport = r.sport || '?';
    const key = `${spotSlug}:${sport}`;
    if (!agg[key]) agg[key] = { better: 0, same: 0, worse: 0, scores: [] };
    const verdict = r.verdict;
    if (verdict === 'better' || verdict === 'same' || verdict === 'worse') {
      agg[key][verdict]++;
    }
    const score = Number(r.predicted_score);
    if (Number.isFinite(score)) agg[key].scores.push(score);
  }

  return Object.entries(agg)
    .map(([key, data]) => {
      const [spotSlug, sport] = key.split(':');
      const n = data.better + data.same + data.worse;
      const avgPredicted =
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0;
      const biasPct = n > 0 ? ((data.better - data.worse) / n) * 100 : 0;
      return {
        key,
        spotSlug,
        sport,
        n,
        avgPredicted,
        biasPct,
        better: data.better,
        same: data.same,
        worse: data.worse,
      };
    })
    .sort((a, b) => b.n - a.n || Math.abs(b.biasPct) - Math.abs(a.biasPct));
}

/**
 * @param {AggRow[]} rows
 */
function summarizeBySport(rows) {
  /** @type {Record<string, { n: number; better: number; worse: number; same: number }>} */
  const bySport = {};
  for (const r of rows) {
    if (!bySport[r.sport]) {
      bySport[r.sport] = { n: 0, better: 0, worse: 0, same: 0 };
    }
    bySport[r.sport].n += r.n;
    bySport[r.sport].better += r.better;
    bySport[r.sport].worse += r.worse;
    bySport[r.sport].same += r.same;
  }
  return Object.entries(bySport)
    .map(([sport, d]) => ({
      sport,
      n: d.n,
      biasPct: d.n > 0 ? ((d.better - d.worse) / d.n) * 100 : 0,
      readyForWeightTune: d.n >= MIN_N_PER_SPORT,
    }))
    .sort((a, b) => b.n - a.n);
}

/**
 * @param {AggRow[]} rows
 */
function flagCandidates(rows) {
  return rows.filter(
    (r) => r.n >= MIN_N_PER_SPOT && Math.abs(r.biasPct) >= BIAS_FLAG_PCT,
  );
}

function assertSupabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — add to .env.local (see .env.example)',
    );
  }

  let apiHost;
  try {
    apiHost = new URL(url).hostname;
  } catch {
    throw new Error('Invalid SUPABASE URL in .env.local');
  }
  if (!apiHost.endsWith('.supabase.co')) {
    throw new Error(
      'SUPABASE URL must be the Project URL (https://<ref>.supabase.co), not the dashboard link. Supabase → Settings → API → Project URL',
    );
  }

  return { url, key };
}

async function fetchFeedbackRows() {
  const { url, key } = assertSupabaseEnv();

  const res = await fetch(
    `${url}/rest/v1/score_feedback?select=spot_slug,sport,verdict,predicted_score,created_at&order=created_at.desc&limit=2000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'Supabase 404 — table score_feedback missing? Run supabase/supabase-score-feedback.sql in the SQL Editor.',
      );
    }
    throw new Error(`Supabase ${res.status}`);
  }
  return res.json();
}

function printReport(rows, bySport, flags) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  console.log('📊 Score feedback — C4b calibration report\n');
  console.log(`  Total feedbacks: ${total}`);
  console.log(`  Spot×sport buckets: ${rows.length}`);
  console.log(
    `  Thresholds: sport N≥${MIN_N_PER_SPORT} for weight tunes; spot N≥${MIN_N_PER_SPOT} + |bias|≥${BIAS_FLAG_PCT}% to flag\n`,
  );

  console.log('── By sport ──');
  if (!bySport.length) {
    console.log('  (no data yet)\n');
  } else {
    for (const s of bySport) {
      const ready = s.readyForWeightTune ? 'READY' : `need ${MIN_N_PER_SPORT - s.n} more`;
      console.log(
        `  ${s.sport}: n=${s.n} bias=${s.biasPct.toFixed(0)}% → ${ready}`,
      );
    }
    console.log('');
  }

  console.log('── Flagged spot×sport (enough n + strong bias) ──');
  if (!flags.length) {
    console.log('  (none — wait for more feedback or weaker bias)\n');
  } else {
    for (const f of flags) {
      const dir =
        f.biasPct > 0
          ? 'users say BETTER than score (score may be low)'
          : 'users say WORSE than score (score may be high)';
      console.log(
        `  ${f.key}: n=${f.n} avgPredicted=${f.avgPredicted.toFixed(0)} bias=${f.biasPct.toFixed(0)}% — ${dir}`,
      );
    }
    console.log('');
  }

  console.log('── Top buckets by volume ──');
  for (const r of rows.slice(0, 15)) {
    console.log(
      `  ${r.key}: n=${r.n} avg=${r.avgPredicted.toFixed(0)} bias=${r.biasPct.toFixed(0)}% (+${r.better}/~${r.same}/-${r.worse})`,
    );
  }

  const anyReady = bySport.some((s) => s.readyForWeightTune);
  console.log('\n── Next step ──');
  if (!total) {
    console.log(
      '  No rows in score_feedback. Confirm Supabase SQL + ScoreFeedback on spot pages.',
    );
  } else if (!anyReady) {
    console.log(
      `  Keep collecting. Do NOT change sportScore.ts weights until a sport hits N≥${MIN_N_PER_SPORT}.`,
    );
  } else {
    console.log(
      '  Sport(s) READY — review flagged buckets, then adjust sportScore.ts with a recorded rationale + npm test.',
    );
  }
}

async function main() {
  loadEnvLocal();
  const wantJson = process.argv.includes('--json');
  const raw = await fetchFeedbackRows();
  const rows = aggregateFeedback(raw);
  const bySport = summarizeBySport(rows);
  const flags = flagCandidates(rows);

  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          total: rows.reduce((s, r) => s + r.n, 0),
          minNPerSport: MIN_N_PER_SPORT,
          minNPerSpot: MIN_N_PER_SPOT,
          biasFlagPct: BIAS_FLAG_PCT,
          bySport,
          flags,
          top: rows.slice(0, 30),
        },
        null,
        2,
      ),
    );
    return;
  }

  printReport(rows, bySport, flags);
}

module.exports = {
  MIN_N_PER_SPORT,
  MIN_N_PER_SPOT,
  BIAS_FLAG_PCT,
  aggregateFeedback,
  summarizeBySport,
  flagCandidates,
  assertSupabaseEnv,
};

if (require.main === module) {
  main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}
