# Per-Dispatch Status Tracking — Closeout

## Goal

Make a vendor's status on a job trackable per-dispatch end-to-end: give the operator a way to hand-advance a
dispatch (vendor-called-in workflow), and let a single-vendor job follow its dispatch's milestones — landing
finished work in a non-terminal **Pending Invoice** stage that hands off to billing.

## Completed deliverables

- **`PENDING_INVOICE` job status** (seed + sort reflow; sandbox + prod, by-name; no migration).
- **`advanceJobStatus`** shared helper; `sendDispatch` + `markBillingClosed` refactored onto it
  (behavior-preserving); `createJob` left inline.
- **Operator hand-advance** — `setAssignmentStatus` (free movement, pure status set, operator provenance) +
  `setAssignmentStatusAction` + `DispatchStatusPicker` on the assignment page.
- **Single-vendor auto-follow** — `DISPATCH_TO_JOB_ADVANCE` + `applyDispatchJobFollow`, wired into both the
  operator and vendor cores, in-tx, forward-only, lock-free.

## Verification

| Check | Result |
|---|---|
| `db:check:billing-close` | 6/6 (markBillingClosed refactor preserved) |
| `db:check:set-assignment-status` | 8/8 (free-move, no-op, DRAFT/SENT reject, operator provenance, re-open) |
| `db:check:dispatch-job-follow` | 8/8 (single→advance, multi→no-move, forward-only, ON_HOLD skip, unmapped skip, both cores) |
| `db:check:dispatch` (phase-22) | green (no regression) |
| `db:check:autonomy` (phase-23) | green (no regression) |
| `tsc --noEmit` / `pnpm build` | 0 / 0 |

**Operator live browser walkthrough** (Claude-in-Chrome, operator-confirmed by Jonny) — both legs observed on
the live request path, not just the harness:
- **Job #3:** dispatch Sent → On Site ⟹ job auto-advanced Dispatched → **In Progress**; Stalled flag cleared.
- **Job #4:** dispatch On Site → Work Complete ⟹ job auto-advanced Dispatched → **Pending Invoice**; Stalled flag cleared.

This confirms the auto-follow fires in-app (not only in the harness) and feeds the exception/notification
surface (the Stalled pressure eased as the job moved). See `10-known-limitations.md` for the one genuine
boundary observed (no retro-advance of a pre-wiring status).

## Commits (local, unpushed at writing)

| Hash | What |
|---|---|
| `0959aa2` | PENDING_INVOICE seed + sort reflow |
| `b9b5792` | `db:check:billing-close` harness |
| `120f8f4` | extract `advanceJobStatus` (refactor 3 sites) |
| `0dcd202` | `db:check:set-assignment-status` harness |
| `377a9b5` | operator hand-advance (core + action + picker) |
| `d3db56c` | `db:check:dispatch-job-follow` harness + set-status teardown fix |
| `a9d722a` | single-vendor auto-follow (both cores) |

## Carry-forward

New banked items + the roll-forward live in the canonical bank,
`docs/phase-27-proposal-agent/closeout-carryforwards.md`: work-order PDF packet + resend-to-vendor;
cross-job dispatches-by-status view; multi-vendor job-status coupling rule; tenant-configurable
reference-data admin UI. **CF-27.16** (billing as a work-unit) rolls forward, now **unblocked** by
per-dispatch status + the `PENDING_INVOICE` seam.
