# Phase 28 — User SOP (Operator)

## Granting per-client autonomy consent
1. Open the client: **Clients → [client]**.
2. Find **"Autonomy allowed"** (below "Priority client").
3. Check the box → **Update**.
4. This records a `client.autonomy_consent_changed` audit entry.

**What it does:** turning it **on** permits the platform to act on this client's jobs autonomously (e.g. auto re-dispatch) — *still* subject to your tenant's autonomy setting and every guardrail. Turning it **off** (the default) means every autonomous action on this client's jobs is **held for your review** instead. No client is acted on autonomously until you consent.

## Auto-retry a stuck dispatch (today's escalation, operator-triggered)
When a dispatch is **Sent** but the vendor goes quiet (ghosted/stuck), the platform surfaces it as an exception. You can escalate it yourself:

- **Per-job — "Auto-retry now"** on the stuck exception row: ghosts the stuck vendor and re-dispatches to the next eligible vendor in one click (runs the same gated flow the autonomous path would). Alongside it, **"Suggest replacement"** stages a re-dispatch draft for you to approve by hand.
- **Tenant-wide — "Auto-retry all eligible"**: sweeps every stuck, still-eligible job and auto-retries each, with an aggregate summary. Idempotent — re-running skips jobs already handled.

Both respect the full gate (tenant autonomy setting, guardrails, policy-conditions, **and per-client consent**). A job whose client has not consented will **not** be auto-retried — it stays a manual suggestion.

> **Note:** there is no unattended/scheduled auto-retry yet — escalation fires when *you* press the button. See `10-known-limitations.md`.

## What policy-conditions do (if your tenant set them)
Your tenant admin can narrow where autonomy applies — e.g. "only NTE ≤ $500", "only handyman trades", "never Emergency priority", or specific-client include/exclude. Conditions can only **restrict** autonomy, never expand it. If a job falls outside the conditions, the action is held for review.
