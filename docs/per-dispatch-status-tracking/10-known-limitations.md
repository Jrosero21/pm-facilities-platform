# Per-Dispatch Status Tracking — Known Limitations

## Verification — done (harness + operator live walkthrough)

The picker render and both auto-follow legs were proven by sandbox harnesses **and** confirmed on the live
request path via an operator browser walkthrough (Claude-in-Chrome, operator-confirmed by Jonny): Job #3
On Site → job In Progress (Stalled cleared); Job #4 Work Complete → job Pending Invoice (Stalled cleared).
No standing verification gap — see the one expected boundary below (no retro-advance).

## Functional boundaries (by design / deferred)

- **Multi-vendor job-status coupling not built.** The auto-follow fires only when a job has exactly one
  active dispatch. With several vendors at different stages, the job status is operator-controlled — there is
  no rule yet for resolving the job's status from multiple dispatches. **Banked.**

- **No cross-job "dispatches by status" operator view.** You see dispatches per job (on the job page); there's
  no tenant-wide "all dispatches at On Site" list. **Banked** (fast follow-on).

- **Auto-follow is lock-free.** The job advance runs without a job-level lock (to avoid an assignment→job lock
  order against `sendDispatch`'s job→assignment order — deadlock risk). A concurrent race resolves to the same
  forward state (forward-only `fromCodes` guard), so it can't regress or corrupt — but it is an accepted,
  unlocked write, not a serialized one.

- **No retro-advance.** A dispatch that reached `ON_SITE`/`WORK_COMPLETE` **before** this wiring went live
  will not retroactively advance its job — the follow only runs on a status change after the build. One-time,
  expected; observed in the walkthrough as Job #4's job sitting at Dispatched while its dispatch was already
  On Site (pre-wiring), then advancing correctly on the Work Complete leg. Advance such jobs by hand if needed.

- **Reference data is seed-managed.** No per-tenant admin UI to add/rename/reorder statuses/trades/priorities
  (resolved by code; **banked** — see the carry-forward bank).

## Operational / infra

- **Operator advance writes no side-effects.** Setting `ON_SITE` by hand does not create a check-in/ETA
  record — those reflect the vendor actually doing the work. Intended (D-PD.3).

- **Shared-host connection cap.** Running multiple `tsx` harnesses while `pnpm dev` holds its DB pool can hit
  `ER_TOO_MANY_USER_CONNECTIONS`. Stop the dev server or run harnesses one at a time.
