# Phase 10 — Vendor Portal MVP · Business Rules

The precise, authoritative rules. Numbered for citation (`06 §N`). Rationale is `02-decisions.md`; flows are `05-system-workflows.md`.

## §1 — Vendor scope (authority: `getVendorScope`)

A user's vendor scope in a tenant = `{ vendor_id : ∃ row in vendor_users where (tenant_id, user_id) match }`. Resolved by `getVendorScope(userId, tenantId): Promise<Set<string>>`. Empty set = no vendor access. This Set is the input to every vendor read filter and act-on-assignment check.

## §2 — Assignment access (authority: `canActOnAssignment`)

`canActOnAssignment(scope, { tenantId, vendorId }, tenantId)` = `assignment.tenantId === tenantId && scope.has(assignment.vendorId)`. Pure (takes the already-resolved scope). A vendor may read/act on an assignment **iff** its `vendor_id` is in scope **and** its tenant matches.

## §3 — Invoice submission gate (authority: `canSubmitVendorInvoice`)

`canSubmitVendorInvoice` mirrors `canActOnAssignment` exactly (tenant + scope). **No status gate** in MVP (`DoR-10n.2`): a vendor may submit at any assignment status. Named separately so a future tightening (require WORK_COMPLETE, `FB-10g.1`) is a one-function edit.

## §4 — Status-transition matrix (`DoR-10k.2`, explicit allowed-from)

| Action | From | To | Side-effect |
|---|---|---|---|
| `acceptDispatch` | `SENT` | `ACCEPTED` | — |
| `declineDispatch` | `SENT` | `DECLINED` (terminal) | reason → `history.note` |
| `confirmEta` | `ACCEPTED` | `SCHEDULED` | `vendor_eta_confirmations` row + sets `scheduledStartAt` |
| `confirmSchedule` | `SCHEDULED` | `CONFIRMED` | — |
| `markOnSite` | `CONFIRMED` | `ON_SITE` | `vendor_check_ins` row |
| `markWorkComplete` | `ON_SITE` | `WORK_COMPLETE` (terminal) | `vendor_check_outs` row |

- Terminal states (`DECLINED`, `WORK_COMPLETE`, `CANCELLED`) admit no vendor action.
- A vendor **never** transitions to `CANCELLED` (operator-only).
- Each action throws `ASSIGNMENT_NOT_IN_REQUIRED_STATUS` if the current status ≠ the required *from*. Statuses are resolved by **code** against `dispatch_assignment_statuses` (global reference table), never by enum mutation.

## §5 — Status writes dual-write history + audit (`DoR-10b.3` + `DoR-10k.1`)

Every vendor transition, in one transaction: updates `jobVendorAssignments.currentStatusId` + inserts a `job_vendor_assignment_status_history` row (from→to, `changedByUserId`) + inserts an `audit_logs` row carrying provenance `metadata: { actor:'vendor', via:'vendor_portal' }`. There is **no `source` column** on the history table; provenance lives in the audit metadata.

## §6 — Vendor transitions never advance the parent job status (`DoR-10k.4`)

A vendor action mutates **only the assignment** (and its presence/ETA rows). The parent `jobs.current_status_id` is untouched; the transition tx locks only the assignment row. Operator review is the point at which job-level onward action (if any) happens.

## §7 — DRAFT exclusion (`DoR-10j.1`)

The vendor jobs list (`listVendorAssignments`) excludes assignments whose status **code** is `DRAFT`. Drafts are operator workspace; a vendor sees an assignment only once it has been sent. Filter: `ne(dispatch_assignment_statuses.code, 'DRAFT')` (code-based, not `sent_at`-based).

## §8 — Vendor note visibility filter (`DoR-10l.2`)

A vendor sees a job's note **iff**:
```
visibility IN ('vendor_visible', 'client_and_vendor_visible')
OR ( origin = 'vendor'
     AND created_by_user_id IN
         (SELECT user_id FROM vendor_users WHERE tenant_id = ? AND vendor_id IN scope) )
```
The author-scope subquery scopes vendor-origin notes to the **viewing** vendor's org, so vendor A cannot read vendor B's vendor-origin notes on a job they both serve. Operator `internal_only`/`client_visible`-only notes stay hidden.

## §9 — Vendor attachment visibility filter (`DoR-10m.1`)

A vendor sees a job's attachment **iff** `uploaded_by_user_id IN` the vendor_users-scope subquery. **No `visibility`-IN branch and no `origin` column** — in MVP there is no operator-side attachment writer and all rows are vendor-internal placeholders. (If a future operator writer/promotion lands, the visibility branch extends symmetrically to §8.)

## §10 — Vendor invoice scope filter

A vendor sees an assignment's invoices **iff** `assignment_id` matches **and** `vendor_id IN scope`. Simpler than §8/§9 — `vendor_invoices` carries explicit `assignment_id` + `vendor_id` columns, so no author-subquery is needed. No status filter: the vendor sees their submitted invoices at any status.

## §11 — Defense-in-depth tenant check

Every vendor predicate (`canActOnAssignment`, `canSubmitVendorInvoice`) re-checks `assignment.tenantId === tenantId` even though scope resolution already filters by tenant. Catches assignment-leak bugs if upstream filtering were ever broken. Redirects/guards are **bare** (no flash/cookie) — the codebase has no flash idiom.

## §12 — Author-scope-vs-origin discriminator (general principle, `DoR-10m.1`)

How a read filter identifies vendor-authored rows: **author-scope is the default** (`created_by`/`uploaded_by ∈` vendor-scope subquery). An **`origin` column is added only when** the read filter must distinguish writes from **multiple actor-classes** on the same user-set. Notes carry `origin` (operators *and* vendors both author notes — cross-class discrimination needed). Attachments do not (MVP-vendor-only writer). The asymmetry is deliberate, not an oversight.
