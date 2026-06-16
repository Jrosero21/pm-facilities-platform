# Per-Dispatch Status Tracking — Business Rules

| Id | Rule | Enforced by |
|---|---|---|
| **R-PD.1** | Status is per-dispatch; a job may have many dispatches; the same vendor can be dispatched more than once. | `job_vendor_assignments` (no (job,vendor) uniqueness) |
| **R-PD.2** | Operator hand-advance is free movement — any target status, including re-open from a terminal status. | `setAssignmentStatus` (no required-from guard) |
| **R-PD.3** | An operator may NOT set Draft or Sent via the picker. | `setAssignmentStatus` → `STATUS_NOT_OPERATOR_SETTABLE`; picker filters them out |
| **R-PD.4** | Setting the status a dispatch is already at is a no-op (no history/audit row). | `setAssignmentStatus` same-status short-circuit |
| **R-PD.5** | Operator advance writes status + history + audit only — no check-in/ETA/check-out side rows. | `setAssignmentStatus` (no `extraSet`, no side-effects) |
| **R-PD.6** | Operator vs vendor provenance is recorded in `audit_logs.metadata.actor` (`operator`/`vendor`), not in the history table. | both cores' audit insert |
| **R-PD.7** | The job follows the dispatch ONLY when the job has exactly one active dispatch (active = status category not in `cancelled`/`draft`). | `applyDispatchJobFollow` count gate |
| **R-PD.8** | Mapping: `ON_SITE → IN_PROGRESS`, `WORK_COMPLETE → PENDING_INVOICE`. Other dispatch statuses do not move the job automatically. | `DISPATCH_TO_JOB_ADVANCE` |
| **R-PD.9** | The auto-follow is forward-only — it never regresses the job; `ON_HOLD` is never auto-advanced. | `advanceJobStatus` `fromCodes` (ON_HOLD absent from every list) |
| **R-PD.10** | The dispatch change and the job auto-follow are atomic (one transaction). | both cores call the follow inside their tx |
| **R-PD.11** | `PENDING_INVOICE` is non-terminal — the job remains actionable (billing advances it onward). | seed (`is_terminal = false`) |
| **R-PD.12** | Reference data (statuses) is resolved by code; ids are never hard-coded. | `getJobStatusByCode` / `getDispatchAssignmentStatusByCode` |
