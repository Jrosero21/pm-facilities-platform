# Phase 23 — Operator SOP

Operator-facing guide to what autonomy does, day to day. **Important context:** as of Phase 23
there is **no live trigger** — `autoDispatchDraftForJob` is a callable mechanism that nothing in
the app invokes automatically yet. First real-tenant enablement is gated behind **Phase 24
observability** (§2.3). This SOP describes the behavior once a trigger and a dashboard exist; today
it is exercised only by the harness.

## When autonomy is OFF (the default)

Every tenant starts fail-safe-gated. When the dispatch router runs for a job, it:
1. **Always creates a DRAFT** dispatch to the top eligible vendor (a draft commits nothing).
2. Stops there and records the outcome **`drafted_pending`** — the draft sits in your queue for
   review, exactly as a manually-created draft would. You send it (or not) by hand.

Nothing is sent to a vendor without you. This is the **manage-by-exception** default: the system
prepares the obvious choice; you approve it.

## When autonomy is ON (a tenant explicitly enabled the agent)

If the tenant has enabled the dispatch router (`autonomyEnabled: true`) **and** the action is
within all guardrails **and** the kill switch is off, the router:
1. Creates the DRAFT, then
2. **Auto-advances it to SENT** — the vendor is dispatched without operator action. Outcome
   **`auto_advanced`**.

You see the sent dispatch in the job timeline (`job.dispatched`), authored by the **system actor**
(no operator name). The decision is recorded as `auto_executed` (see below).

## How a gated exception (`drafted_pending`) appears

A `drafted_pending` result means: a draft exists, the agent *wanted* to act but was **not
permitted**. The draft is yours to review. The reason is recorded in the decision's `blockedBy`:

| `blockedBy` | What it means |
|---|---|
| `not_enabled` | The tenant has not turned this agent's autonomy on (the default). |
| `kill_switch` | The tenant-wide kill switch is on — all autonomy reverted to gated. |
| `token_ceiling` | The tenant's LLM-token cap (24h or lifetime) is reached. |
| `spend_ceiling` | A committed-dollar cap (per job / day / tenant) would be exceeded. |
| `unmeasurable_nte` | The job has no NTE, so the spend can't be bounded — blocked on purpose. |

A gated draft is **not an error** — it is the system correctly deferring to you.

## Using the kill switch

If autonomous dispatch is misbehaving (wrong vendors, too aggressive), have an admin flip the
tenant **kill switch** on (see `04-admin-sop.md`). It takes effect immediately and for **every**
agent: the next run resolves to `drafted_pending` (reason `kill_switch`) regardless of any per-agent
opt-in. Existing sent dispatches are unaffected (the switch governs future actions, not past ones).

## Reading `auto_executed` vs `policy_blocked` decisions

Each governed run records one decision row (under the agent's run history):
- **`auto_executed`** — autonomy fired: the draft was advanced to SENT within policy + guardrails.
- **`policy_blocked`** — autonomy was held back: the draft stays for your review. The reasoning and
  `blockedBy` tell you which gate stopped it.
- **`queued_for_review`** *(with a failed run)* — autonomy was permitted but the **send itself
  failed** (`drafted_send_failed`); the draft awaits you, and the run's error message says why.

Every autonomous action — fired or blocked — leaves a row. Nothing happens silently (§2.2).
