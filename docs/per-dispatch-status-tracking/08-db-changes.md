# Per-Dispatch Status Tracking — DB Changes

## No schema change — one reference-data seed

This build added **no migration**. The only DB change is reference data: a new `job_statuses` row plus a
`sort_order` reflow, delivered through `db/seeds/job-reference.ts`.

### `PENDING_INVOICE` + sort reflow

| code | name | category | sort_order | is_terminal |
|---|---|---|---|---|
| NEW | New | open | 1 | 0 |
| SCHEDULED | Scheduled | open | 2 | 0 |
| DISPATCHED | Dispatched | in_progress | 3 | 0 |
| IN_PROGRESS | In Progress | in_progress | 4 | 0 |
| **PENDING_INVOICE** | **Pending Invoice** | **completed** | **5** | **0** |
| ON_HOLD | On Hold | on_hold | 6 | 0 |
| COMPLETED | Completed | completed | 7 | 1 |
| CANCELLED | Cancelled | cancelled | 8 | 1 |
| CLOSED | Closed | completed | 9 | 1 |
| CLOSED_BILLED | Closed (Billed) | completed | 10 | 1 |

- `PENDING_INVOICE` is **non-terminal**, category `completed` — the "operationally done, awaiting invoicing"
  stage a single vendor's `WORK_COMPLETE` lands the job in.
- Inserting at sort 5 reflowed `ON_HOLD..CLOSED_BILLED` down by one. The seed loop was made
  idempotent/convergent: it inserts a missing status and **updates `sort_order` only** on existing rows
  (never name/category/terminal/code). Re-running converges.

### Applied (by-name, both DBs)

| DB | Result | Verified |
|---|---|---|
| `jonnyrosero_pm_sandbox` | 1 inserted, 9 reflowed | 10 statuses; PENDING_INVOICE @5 non-terminal; existing flags unchanged |
| `jonnyrosero_pm` (prod) | 1 inserted, 9 reflowed | same; **jobs row count unchanged (4)** — no job rows touched |

No `__drizzle_migrations` row (this is a data seed, not a tracked migration — consistent with how reference
seeds are applied).

## Tables read/written by the feature (no DDL)

| Table | Use |
|---|---|
| `job_vendor_assignments` | the dispatch; `current_status_id` set by both cores |
| `job_vendor_assignment_status_history` | per-dispatch transition log (operator + vendor) |
| `jobs` / `job_status_history` | the auto-follow advance (via `advanceJobStatus`) |
| `audit_logs` | operator/vendor provenance on every transition |
| `job_statuses` / `dispatch_assignment_statuses` | reference lookups by code |
