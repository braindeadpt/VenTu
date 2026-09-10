# External keep-alive for the data pipeline

GitHub Actions `schedule` delivery is best-effort: events can be delayed
(the 2026-09-08 incident: runs stuck 07:42 → 12:31 UTC while a manual
dispatch succeeded in seconds) and a delayed run still queued at the next
slot is dropped (coalesced). The pipeline survives single missed slots —
the Lisbon-aware gate plus `needsFullCatchUp` resurrect it — but **cadence
should not depend on GitHub's scheduler at all**. This document describes
the external keep-alive that makes it independent.

## How it works

The workflow `Update VenTu Data` accepts a `repository_dispatch` event of
type `ping` (`.github/workflows/update-data.yml`). An external scheduler
(cron-job.org, Cloudflare Workers, any HTTP cron) POSTs a dispatch to
GitHub once per interval; the workflow's gate decides what happens next.

The ping is a **safety net, never a second scheduler**:

| State | Gate decision |
|-------|---------------|
| Open-Meteo overdue (`fullUpdatedAt` older than 2.5 h day / 4.5 h night) | `full` run |
| Obs merge overdue (`observationsUpdatedAt` older than 3 h day / 5 h night) | `observations` run |
| Data fresh | `skip` — cheap no-op, no fetch, no double-run |

Because the gate skips when data is fresh, a ping can never double-run a
healthy hour — the GitHub `schedule` crons (`:17`/`:47`) keep owning normal
cadence, and the external ping only resurrects the pipeline when it is
actually overdue. That is the whole point: normal operation is unchanged;
the failure mode "GitHub forgot to run us" becomes impossible.

The gate branch lives in `scripts/should-run-data-update.js`
(`VENTU_KEEPALIVE=1`, set by the workflow for `repository_dispatch`
events). An optional `client_payload.force_mode` (`full` or
`observations`) forces a run regardless of freshness, mirroring the
`workflow_dispatch` input — useful for remote ops.

## 1. cron-job.org (recommended — zero infra)

1. Create an account and a new job.
2. **URL**: `https://api.github.com/repos/braindeadpt/VenTu/dispatches`
3. **Method**: POST
4. **Headers**:
   - `Authorization: Bearer <PAT>`
   - `Accept: application/vnd.github+json`
   - `Content-Type: application/json`
   - `User-Agent: cron-job.org-keepalive`
5. **Payload**: `{"event_type": "ping"}`
6. **Schedule**: every 30 minutes, on a minute that does not collide with
   the `:17`/`:47` GitHub crons (e.g. `5,35`). Frequency only affects how
   fast the pipeline resurrects after an outage — the gate prevents any
   double-run — so 30 min is a good cost/coverage balance.

### Required token

A fine-grained PAT scoped to `braindeadpt/VenTu` with **Contents: Read
and write** (repository_dispatch is a contents-write action), or a classic
PAT with the `repo` scope. Store it as a secret in cron-job.org — never in
the repo. A scoped, repo-limited token is strongly preferred; it can do
nothing beyond dispatching this workflow.

### Verified working

```bash
curl -sS -X POST https://api.github.com/repos/braindeadpt/VenTu/dispatches \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "ping"}' \
  -w '%{http_code}\n'   # 204 = accepted
```

## 2. Serverless alternative (Cloudflare Workers)

A Worker with a cron trigger (`0 */30 * * * *`) that runs the same POST is
functionally identical to cron-job.org. Any HTTP scheduler works — the
contract is just one authenticated POST per interval. The value of
**two** independent schedulers (GitHub `schedule` + one external) is that
they fail independently; running the keep-alive on a third platform is
over-engineering unless cron-job.org itself becomes the concern.

## Verification

- `npx vitest run scripts/lib/__tests__/updateSchedule.test.js` — covers
  `needsObsCatchUp` (day/night thresholds, fresh, missing timestamps).
- Simulate a ping locally:
  `VENTU_KEEPALIVE=1 node scripts/should-run-data-update.js` with a stale
  `public/data/pipeline-meta.json` → prints `mode: full`; with a fresh one
  → `mode: skip` with the keep-alive message.
- End-to-end: POST the dispatch above, then
  `gh run list --workflow=update-data.yml` — the run appears within a
  minute and either runs the pipeline or exits at the gate with `mode:
  skip` (a healthy-hour ping).

## 3. Native heartbeat fallback (no config — built into the repo)

The cadence heartbeats (`staleness-alert.yml` + `data-cadence-alert.yml`, every
30 min at `:07/:37` and `:12/:42`) **themselves auto-resurrect the pipeline**
when they open a `data-stale` issue: right before the issue is created they
POST a `repository_dispatch(ping)` with the workflow's own `GITHUB_TOKEN`
(`contents:write`). The gate (`VENTU_KEEPALIVE=1`) only runs when overdue, so
a fresh pipeline just skips — cadence recovers ~30 min after the 3h alert
threshold even when no external scheduler is configured. An external scheduler
(cron-job.org) stays preferable — it resurrects at 2.5h instead of 3h — but
cadence no longer *depends* on it.

Only one heartbeat fires per outage (first to open the issue); the
open-issue guard prevents a second dispatch, and a failed dispatch is logged
without turning the run red — alerting is never blocked by a resurrection
failure.

## Companion: staleness alert (independent heartbeat)

The keep-alive *resurrects* the pipeline; the **staleness alert**
(`staleness-alert.yml` + `scripts/check-pipeline-staleness.js`) is the
*pair of eyes* that makes a missed slot visible. They are complementary:

- The pipeline's own TTL validator only runs **when the pipeline runs**,
  so a dead pipeline is invisible to every check it owns. The heartbeat
  runs on its **own** schedule (every 30 min) and compares
  `pipeline-meta.json` age against a threshold — **3 h daytime / 5 h
  night**, deliberately *above* the keep-alive resurrection margins
  (2.5/4.5 h), so a successful silent resurrection is not an incident.
  The alert fires exactly when the gap outlived the resurrection (or no
  keep-alive is configured): normal max gaps are 2 h day / 4 h night, so
  the threshold only trips on a definitively missed slot.
- Alert delivery mirrors `monitor-ih-tides.sh`: state = the open issue
  with label `data-stale` (opened on stale, commented + closed on
  recovery, no external state, no spam on long outages), plus an ops
  Telegram message on the down/up transitions when
  `OPS_TELEGRAM_CHAT_ID` + `TELEGRAM_BOT_TOKEN` are configured. Exit 0
  always — the issue/Telegram are the channel, not red runs.
- Even a delayed GitHub schedule delivery still alerts eventually; the
  3 h threshold absorbs the jitter. If you want the alert itself on a
  non-GitHub scheduler, point the same external cron at a
  `workflow_dispatch` of `staleness-alert.yml`.
- Since 2026-09-10 the heartbeats are **self-healing**: the fallback above
  means a `schedule`-only repo still recovers without any external cron;
  the external cron just heals faster (2.5h vs 3h).

## Why not just remove the GitHub crons?

Two (now three) independent triggers are the point: GitHub `schedule` +
external ping + heartbeat self-healing fail independently, and the ping's
resurrection-only semantics make the pair idempotent — both firing at once
is just one run plus one cheap skip. Keeping the external ping means
healing in 2.5h instead of 3h; dropping it still heals, just slower.