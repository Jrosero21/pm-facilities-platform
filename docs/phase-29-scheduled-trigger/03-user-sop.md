# Phase 29 — User SOP (Operator)

## What the trigger does
It sweeps your tenant for **genuinely stuck dispatches** — a job sent to a vendor who has not accepted
within the threshold for that job's priority — and, where autonomy permits, re-dispatches each to the
next best eligible vendor. Where autonomy does **not** permit, it prepares a draft and **holds it for
your review**. It can never widen permission; every layer can only hold.

## Two ways to run it — same code
| Path | Where | Who |
|---|---|---|
| **Sweep button** | `/notifications` (exceptions surface) | operator, in-session |
| **Trigger route** | `POST /api/cron/auto-redispatch` | anything holding `CRON_SECRET` |

Since Phase 29 both run `runAutoRedispatchSweep`. Behaviour for the button is unchanged **except**
that it now also applies the per-job cooldown (a job auto-re-dispatched within the last 4 hours is
skipped as `cooldown`).

## Firing it manually
Local dev server:
```bash
curl -s -X POST http://localhost:3000/api/cron/auto-redispatch \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```
Deployed: same, against your deployment host.

Response:
```json
{ "ok": true, "startedAt": "...", "durationMs": 1234, "tenantsScanned": 1,
  "totals": { "swept": 25, "autoSent": 24, "heldForReview": 0, "skipped": 1,
              "byReason": { "no_eligible_vendor": 1 } },
  "perTenant": [ { "tenantId": "...", "summary": {} } ] }
```
A wrong or missing token returns `401` and does no work.

## Reading the summary
| Field | Meaning |
|---|---|
| `swept` | candidates considered (includes cooldown skips) |
| `autoSent` | autonomously re-dispatched — **money committed, vendor contacted** |
| `heldForReview` | draft prepared, blocked by a gate — **needs you**; `byReason` names the gate |
| `skipped` | no action; `byReason` says why (`cooldown`, `exhausted`, `no_eligible_vendor`, `already_suggested`, `autonomy_off`) |

`heldForReview > 0` is the line that wants your attention — those are drafts waiting in the
exceptions queue.

## It is safe to fire at any time
With autonomy off — **the default everywhere** — a sweep scans nothing, writes nothing, and returns
`tenantsScanned: 0`. Firing it repeatedly is harmless: the cooldown prevents re-entry on the same job
inside 4 hours, and the count cap bounds total attempts per job at 3.

## What it will NOT do
- It will not touch a dispatch that is not past its priority's stuck threshold.
- It will not re-try a vendor already assigned on that job.
- It will not exceed **3** total attempts on one job.
- It will not act for a client who has not consented (`autonomy_allowed`, default false).
- **It does not run on a timer.** Nothing happens unless you (or a scheduler you set up) call it.
