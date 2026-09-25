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

## The same ping wakes the monitors

A `repository_dispatch` event is delivered to **every** workflow that
declares it — the `event_type` is not routed to a single workflow. The
heartbeats and monitors declare the same `types: [ping]`, so one POST from
the external cron wakes the pipeline **and** its watchdogs:

| Workflow | What a ping makes it do |
|----------|-------------------------|
| `update-data.yml` | gate → `full` / `observations` / `skip` (resurrection) |
| `staleness-alert.yml` | `pipeline-meta.json` age → issue `data-stale` |
| `data-cadence-alert.yml` | last `public/data` commit age → issue `data-stale` |
| `ih-health.yml` | IH tide + IPMA radar probes → issues `ih-outage` / `ipma-radar-outage` |
| `telegram-poll.yml` | `/start` deep-link poll |

**No extra external job is needed** — the cron you already run for the
pipeline now also keeps the monitors off GitHub's best-effort scheduler.
That is the point: the measured nominal delivery on 21–24/09 was 2–23% for
some of those crons (Telegram Link Poll 2%, Pipeline Staleness Alert 12%,
Data Cadence Alert 12%, IH Tide Health Monitor 23%), so when GitHub dropped
the slot nobody was watching the pipeline precisely when the scheduler was
failing. With the shared ping, a dropped GitHub slot only delays the
*check*, never the *resurrection*.

Every monitor is idempotent — its state is the open issue (or, for the
poll, the stored offset) — so an extra tick can never duplicate an
incident: it either finds nothing or re-confirms an incident already open.
The `schedule:` crons stay in place on purpose; the ping is **additive**,
never a replacement, so the two triggers still fail independently.

Guard: `src/lib/__tests__/keepaliveTriggers.test.ts` fails if a monitor
loses the trigger, or if a `schedule` is removed.

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

Do **not** create one job per workflow: the single `{"event_type":"ping"}`
POST already reaches the pipeline and all four monitors (see above).

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

That self-healing dispatch carries the same `ping` type, so it also wakes the
other monitors (IH/radar probes, Telegram poll). That is deliberate and
harmless: they are idempotent, and the heartbeat only dispatches when it is
*opening* the issue (guarded), so a long outage adds one extra round of runs —
never a loop (a re-run finds the issue already open and dispatches nothing).

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
  3 h threshold absorbs the jitter — and since the monitors now declare
  `repository_dispatch(ping)`, the external cron that keeps the pipeline
  alive also wakes the alert, so no separate external job is needed for it.
- Since 2026-09-10 the heartbeats are **self-healing**: the fallback above
  means a `schedule`-only repo still recovers without any external cron;
  the external cron just heals faster (2.5h vs 3h).

## Why not just remove the GitHub crons?

Two (now three) independent triggers are the point: GitHub `schedule` +
external ping + heartbeat self-healing fail independently, and the ping's
resurrection-only semantics make the pair idempotent — both firing at once
is just one run plus one cheap skip. Keeping the external ping means
healing in 2.5h instead of 3h; dropping it still heals, just slower.