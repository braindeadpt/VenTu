/**
 * evaluate-alerts.js — H2: verification email selection is per ADDRESS.
 *
 * The relay bug: each pending row carried its own `last_sent_at`, so N pending
 * rows for one victim address meant N verification emails every 24h, minted by
 * an attacker who could rotate `client_id` freely. selectVerificationTargets()
 * must therefore collapse rows by address and apply the cooldown to the most
 * recent send across ALL of that address's rows.
 *
 * Pure function → no Supabase/Resend, no network.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  selectVerificationTargets,
  VERIFICATION_RETRY_MS,
  MAX_VERIFICATION_SENDS_PER_RUN,
} = require('../../evaluate-alerts.js');

const NOW = Date.parse('2026-09-22T07:30:00Z');
const HOUR = 60 * 60 * 1000;

const pending = (id, email, lastSentAt = null) => ({
  id,
  email,
  verified: false,
  last_sent_at: lastSentAt,
});

describe('selectVerificationTargets (H2)', () => {
  it('collapses 5 pending rows for one victim address into ONE email', () => {
    const subs = [1, 2, 3, 4, 5].map((n) => pending(n, `victim@example.com`, null));
    const targets = selectVerificationTargets(subs, NOW);

    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe(1);
  });

  it('treats mixed-case addresses as the same address', () => {
    const subs = [
      pending(1, 'Victim@Example.com'),
      pending(2, 'victim@example.com '),
      pending(3, 'VICTIM@EXAMPLE.COM'),
    ];
    expect(selectVerificationTargets(subs, NOW)).toHaveLength(1);
  });

  it('skips an address whose ANY row was mailed within the last 24h', () => {
    // Row 2 was mailed 1h ago; rows 1 and 3 still carry a stale clock.
    // The old per-row logic would have mailed the victim twice more today.
    const subs = [
      pending(1, 'victim@example.com', new Date(NOW - 30 * 24 * HOUR).toISOString()),
      pending(2, 'victim@example.com', new Date(NOW - 1 * HOUR).toISOString()),
      pending(3, 'victim@example.com', null),
    ];
    expect(selectVerificationTargets(subs, NOW)).toHaveLength(0);
  });

  it('allows a resend once the 24h cooldown has passed', () => {
    const stale = new Date(NOW - VERIFICATION_RETRY_MS - HOUR).toISOString();
    const subs = [
      pending(1, 'a@example.com', stale),
      pending(2, 'b@example.com', stale),
    ];
    expect(selectVerificationTargets(subs, NOW)).toHaveLength(2);
  });

  it('ignores verified rows and rows without an address', () => {
    const subs = [
      { id: 1, email: 'a@example.com', verified: true, last_sent_at: null },
      { id: 2, email: '', verified: false, last_sent_at: null },
      { id: 3, verified: false, last_sent_at: null },
      pending(4, 'c@example.com'),
    ];
    expect(selectVerificationTargets(subs, NOW).map((s) => s.id)).toEqual([4]);
  });

  it('caps a hostile burst at MAX_VERIFICATION_SENDS_PER_RUN per run', () => {
    // Attacker mints 5 pending rows per victim across 150 distinct addresses.
    const subs = [];
    for (let a = 0; a < 150; a++) {
      for (let r = 0; r < 5; r++) {
        subs.push(pending(`${a}-${r}`, `victim${a}@example.com`));
      }
    }
    const targets = selectVerificationTargets(subs, NOW);

    expect(targets).toHaveLength(MAX_VERIFICATION_SENDS_PER_RUN);
    // Still exactly one row per address — the cap never re-inflates the flood.
    expect(new Set(targets.map((t) => t.email)).size).toBe(targets.length);
  });

  it('handles an empty/absent list', () => {
    expect(selectVerificationTargets(undefined, NOW)).toEqual([]);
    expect(selectVerificationTargets([], NOW)).toEqual([]);
  });
});
