# Phase 9 — Aggregator Dashboard & Analytics MVP · User SOP

For operators, dispatchers, and accounting users. What you see on `/dashboard` and how to act on it. (How it works internally is `05-system-workflows.md`; the precise rules are `06-business-rules.md`.)

## §1 — Reading the dashboard

`/dashboard` is your starting point. It shows your tenant's live operational picture, composed from the current state of every job.

- **"Open" job** — a job counts as open until it's marked complete/cancelled (or archived from view). Archived jobs drop out of the dashboard's counts (`06 §1`).
- **What you see depends on your role:** operators/dispatchers see the operational panels (the queue, status/priority cards, top clients/trades, timing); accounting sees pending invoices; a tenant admin sees everything. If you see "No dashboard panels are available for your role yet," your role isn't wired to any panel.
- **Start at the top:** the **Needs attention** strip (stalled count) and the **Operational queue** are the action surfaces — look there first.

## §2 — Understanding urgency tiers (the queue)

The Operational queue ranks open jobs by urgency. Each row carries one tier badge (`06 §7`):

- **Stalled (red)** — the job has sat in its current status too long; investigate.
- **Overdue (amber)** — its due date has passed.
- **Unassigned · high priority (amber)** — an EMERGENCY or URGENT job with no vendor assigned yet.
- **Aged (neutral)** — in the queue on dwell time, but not in a higher tier.

The queue is sorted highest-urgency first, longest-waiting first within a tier, and shows the top 20.

## §3 — What "stalled" means

A job is **stalled** when it's been in its current status longer than that status allows (`06 §4`):

| Status | "Too long" after |
|---|---|
| New (untriaged) | 4 hours |
| Scheduled (vendor not arrived) | 2 hours past the start time with no on-site check-in |
| Dispatched (no progress) | 24 hours |
| In progress (no update) | 72 hours |
| On hold (unresolved) | 7 days |

**When you see a stalled job:** open its detail, check the timeline, and contact the vendor or client to move it forward.

## §4 — Status cards

Five cards (NEW, SCHEDULED, DISPATCHED, IN_PROGRESS, ON_HOLD) show the open-job count per status. **Click a card** to jump to `/jobs` filtered to that status — handy for batch-reviewing everything in one state. **Zero-count cards are shown on purpose:** "0 ON_HOLD" tells you nothing is parked.

## §5 — Priority cards

Five cards by rank: **EMERGENCY > URGENT > HIGH > ROUTINE > SCHEDULED**. Each shows the open-job count at that priority; **click** to filter `/jobs` to it.

## §6 — Top clients / top trades

A quick scan of where your open work is concentrated (top 5 each). These are **analytical panels, not navigation** — they're not clickable.

## §7 — Distribution panels (time-in-status, time-to-dispatch)

Percentile readouts of historical performance:
- **p50** = the typical case. **p90** = "most of the time, no worse than this."
- A **"No data yet"** state early on is normal — these panels **light up as data flows**. They're historical, so they include since-archived jobs (`06 §2`).

## §8 — Pending invoices (accounting / tenant-admin view)

- **Vendor (AP) pending** — invoices the aggregator owes vendors that are **approved but not yet paid**.
- **Client (AR) pending** — invoices clients owe that have been **sent but not yet paid**.
- For the exact inclusion rules, see `06 §3` (you don't need them day-to-day — drafts and disputed/void invoices aren't counted).

## §9 — The job-detail "Stalled" badge

On `/jobs/[id]`, a red **"Stalled"** badge next to the job number means the job has crossed its status threshold (`06 §4`). It always agrees with what the dashboard queue shows for that job (`06 §10`). **No badge** = the job is within threshold, or it's closed.

## §10 — The filtered `/jobs` view

`/jobs` lists all your open jobs. Dashboard cards link here with a filter applied (`?status=…` / `?priority=…`). When filtered, you'll see **"Showing N filtered jobs. [Clear filters]"** — click **Clear filters** to go back to the full list. A stale or mistyped filter in the URL is simply ignored (no error page), so bookmarked/shared links degrade gracefully.
