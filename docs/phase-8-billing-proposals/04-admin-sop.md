# Phase 8 — Admin SOP (NTE Rules)

Phase 8 added exactly **one** admin surface: per-client **NTE (not-to-exceed) rules**. (`client_billing_rules` itself — markup %, payment terms, tax-exempt — is the Phase-2 client-config substrate; Phase 8 reads it but added no new admin UI for it.) The rules behind this are in `06-business-rules.md`.

## What an NTE rule is

A default spending ceiling that gets **snapshotted onto a job at creation time**. A rule is keyed by **client × trade × priority [× optional location]** and carries an `nte_amount` (+ currency). When a job is created with a trade and a priority, the system resolves the matching rule and stamps `jobs.not_to_exceed_amount` from it (the operator can override at creation — see the override matrix in `06-business-rules.md`). The snapshot is point-in-time: later rule edits don't retroactively change existing jobs.

## Where

Each client's rules live at **`/clients/[id]/nte-rules`** (reachable from the "Billing NTE rules →" link on the client detail). The page lists the client's rules and has an "Add a rule" form.

## The resolution ladder (most-specific wins)

When resolving the NTE for a job, the system tries, in order:
1. **location** — a rule for this client + trade + priority + the job's specific location.
2. **client-wide** — a rule for this client + trade + priority (no location).
3. **handyman-location** — a `HANDY`-trade rule for this client + priority + location (the trade-agnostic fallback).
4. **handyman-client-wide** — a `HANDY`-trade rule for this client + priority (no location).

The first rung that matches an **active** rule wins. If none match, the job has no rule-resolved NTE (the operator can still enter one manually, or the job has no ceiling).

## Managing rules

- **Create** — pick trade + priority, optionally a location ("Client-wide (all locations)" is the default), enter the amount + currency. **Creating an active rule supersedes any existing active rule for the same key** — the system archives the old active and makes the new one active, atomically (the *single-active* invariant: at most one active rule per key). If you somehow hit "An active NTE rule already exists for this combination," archive it first.
- **Archive** — retires a rule (active → archived). Lowers the active count; no single-active concern.
- **Activate** — re-promotes an *archived* rule for its key, superseding whatever is active for that key. (Activate is for bringing an archived rule back; *create* is for a brand-new active rule — if you try to activate a rule that's already active or whose key changed, you'll get "This rule can't be activated…".)

A rule shows its status badge (active / archived); active rules offer **Archive**, archived rules offer **Activate**.

**To change a rule's amount or scope,** create a new active rule for the same key (tenant + client + trade + priority [+ location]); the data layer supersedes the prior active rule automatically (the single-active invariant, R-7.1). There is no in-place edit — superseding preserves the old rule's history.

## Tie-break (multiple defaults)

If two active rules ever match the same key (the system prevents this on the happy path, but data can pre-exist), resolution is deterministic: **earliest `created_at`, then lowest `id`**. So the oldest rule wins — predictable, never ambiguous.

## Emergency multiplier (forward-flag)

There's a per-client **`emergency_nte_multiplier`** column (on `client_billing_rules`, 8b-D1) intended to raise the NTE for emergency-priority jobs. **Phase 8 stores it but does not apply it** — no resolver reads it, the 8b-design tenant-default of `1.50` was never wired, and there's no admin UI. The emergency-multiplier mechanism is entirely deferred (see `10-known-limitations.md`). The per-(client × trade × priority) rules above are the admin surface Phase 8 ships.

## Audit trail

Every NTE-rule lifecycle change writes an **audit_logs** row (atomic with the change): `action = "client_nte_rule.created" | ".activated" | ".archived"`, `target_type = "client_nte_rule"`, `target_id = the rule id`, with the rule's key in metadata. NTE-rule changes are tenant-config edits, so they go to `audit_logs` (the platform-wide audit), not the job-scoped billing-event timeline. To review who changed a client's NTE rules and when, query `audit_logs` for `target_type = "client_nte_rule"`.

NTE-rule administration is **operator-level** (any tenant user with access) — not accounting-gated. It configures *future* commitments; it isn't an in-the-moment money action (those — issue invoice, record payment, close billing — are the accounting-gated ones).
