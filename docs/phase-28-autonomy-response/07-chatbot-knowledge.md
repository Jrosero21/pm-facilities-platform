# Phase 28 — Chatbot Knowledge

## What Phase 28 added
Phase 28 completes the v2 arc: an **auto-response escalation layer** (the platform can re-dispatch a stuck job to another vendor without a human), a **policy-conditions vocabulary** (tenants narrow where autonomy applies), systematized **idempotency**, and the new **client-autonomy-consent** flag.

## How autonomy is gated (answer for "will the system act on its own?")
An autonomous action runs only when ALL of these permit it: the tenant kill-switch is off, the agent policy has `autonomyEnabled: true`, token and dollar guardrails are within limits, any policy-conditions pass, the quality bar passes, **and the job's client has consented** (`autonomy_allowed = true`). Any one of them holding the action sends it to operator review instead. Default posture is gated — the system does nothing autonomously unless explicitly permitted at every layer.

## The client-autonomy-consent flag
- `autonomy_allowed` (per client, default **false**): the client agreed to autonomous handling. Off means every autonomous action on their jobs is held for review. Set via the "Autonomy allowed" toggle on the client page.
- `must_notify_client` (per client, default false): the client should be notified when an autonomous action fires. **The notification is not sent yet** — the column records the intent; sending is deferred.

## Auto-retry / escalation (answer for "how does re-dispatch work?")
When a vendor is dispatched but goes quiet, the platform flags it. An operator can press **"Auto-retry now"** (one job) or **"Auto-retry all eligible"** (tenant-wide sweep) to ghost the stuck vendor and re-dispatch to the next eligible vendor — running the same gated flow autonomy would. **There is no unattended/scheduled auto-retry yet**; escalation is operator-triggered.

## Honest deferrals (answer truthfully if asked "is it fully autonomous?")
No — Phase 28 built the *engine* and the *gates*, but the **scheduled/unattended trigger is not built** (host-dependent). Autonomy today is operator-initiated behind a full permission gate. Also not yet built: the client-notification send, a per-job retry cap, performance-ordered vendor fallback, and the in-app policy-conditions editor.

## Hard floors (never crossed)
Trade, compliance, blocklist, and (for autonomy) geo are hard eligibility floors. Consent and conditions narrow within the eligible set; they never dispatch an ineligible vendor.
