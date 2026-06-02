# Phase 22 — Business Rules

Each rule maps to the harness group/assertion that proves it (`pnpm run db:check:dispatch`, **30/0**, green from committed state). Group key: **G1** floor-trade · **G2** floor-geo · **G3** floor-compliance · **G4** floor-blocklist · **G5** preference ordering · **G6** blocklist-beats-preference · **G7** cross-tenant · **G8** auto-picker draft-gate · **G9** idempotency · **G10** auto_drafted audit · **G11** no-candidates · **G12** write-boundary.

| Id | Rule | Harness |
|---|---|---|
| **R-22.1** | **Trade floor (invariant 5).** A vendor is a candidate only if it has active coverage for the job's primary trade; a vendor with no coverage is excluded. | G1 (1a includes vendor_PASS, 1b excludes vendor_NO_TRADE) |
| **R-22.2** | **Geographic-coverage floor (invariant 5).** A vendor must have an active service area matching the job location by equality (national/state/city/postal). A vendor whose only area is elsewhere (e.g. TX for an NY job) is excluded. | G2 |
| **R-22.3** | **Compliance floor — fail-open-with-flag (invariant 5; TEMPORARY, D-5.2).** A vendor with an active `expired`/`non_compliant` compliance row is excluded; an **absent** compliance row is `no_data` = eligible-but-recorded (snapshotted at dispatch). Tightens to a hard gate when data lands — no schema change. | G3 (excludes vendor_BAD_COMPLIANCE) |
| **R-22.4** | **Blocklist floor (invariant 5; net-new).** A vendor with an active `location_blocked_vendors` row for the job's `(client, location)` — or a client-wide row (NULL location) — is excluded, regardless of trade. | G4 (excludes vendor_BLOCKED) |
| **R-22.5** | **Preference ordering.** A vendor preferred for the job's `(location, trade)` sorts **first** (`preferenceRank` ascending, NULLs last); a non-preferred eligible vendor sorts after it. Preference orders, never filters. | G5 (5a–5e: preferred is candidates[0], rank=1; vendor_PASS after, rank=null) |
| **R-22.6** | **Blocklist beats preference — exclusion wins (the core safety rule).** A vendor that is **both** preferred **and** blocked at the location is **excluded entirely** — it is never surfaced and never first. Exclusion happens before preference is considered. | G6 (vendor_PREFERRED_AND_BLOCKED absent) |
| **R-22.7** | **Cross-tenant isolation.** A tenant-B job matches only tenant-B vendors; tenant-A's preferred/blocked rows (tenant_id=A) do not affect B's matching, and the candidate sets are tenant-disjoint. | G7 (7a–7c) |
| **R-22.8** | **Gate-ability — auto creates DRAFT, never SENT (invariant 4 prep).** Rule-based auto-dispatch lands the assignment at **DRAFT** and never advances it; the picker reuses `createDispatch` (always-DRAFT) and never calls `sendDispatch`. | G8 (8a drafted, 8b status=DRAFT, 8c drafted vendor = top candidate) |
| **R-22.9** | **Idempotency on the autonomous write (invariant 6).** A second auto-dispatch on a job that already has a non-terminal assignment is a no-op (`already_active`); exactly **one** assignment exists — no double-dispatch. | G9 (9a already_active, 9b count=1) |
| **R-22.10** | **Autonomy never silent (invariant 2).** Every auto-drafted assignment writes a `job_vendor_assignment.auto_drafted` audit row with a **NULL** acting user (system actor) and metadata carrying the rule + preferenceRank. | G10 (10a–10c) |
| **R-22.11** | **Manage by exception (invariant 7).** When the floor empties the candidate set, auto-dispatch returns `no_candidates` and **creates nothing** — the exception surfaces rather than a bad dispatch. | G11 (11a no_candidates, 11b zero assignments) |
| **R-22.12** | **Write-boundary + facet snapshot.** The auto-picker creates exactly the top candidate's DRAFT assignment and nothing else; the immutable facet snapshot is populated (`matched_trade_id`, `compliance_status_at_dispatch`), and the row's `created_by_user_id` is NULL (system actor). | G12 (12a–12d) |

## Invariant scope note

**Phase 22 is NOT the autonomy policy engine** — that is **Phase 23** (per-agent on/off, guardrail layer, kill switch). Phase 22 builds the **dispatch mechanism Phase 23 will govern**. The v2 §2 invariants it binds directly, each proven above:

- **Invariant 5 — hard eligibility floor (the candidate-set floor AI can never override).** Trade + geographic coverage + compliance + not-blocklisted are hard filters; the compliance check lives **in** the dispatch path. → R-22.1–R-22.4. The blocklist is **exclusion-before-preference** (R-22.6) — the floor is a floor, and neither a preference row nor (later) AI can promote an excluded vendor.
- **Invariant 4 — gate-ability prep (non-overridable guardrails are Phase 23).** The auto-dispatch path defaults to **DRAFT** and **cannot** auto-send; it is governable rather than acting unconditionally. → R-22.8.
- **Invariant 6 — idempotency on every autonomous write.** A dispatch cannot double-send (per-job non-terminal guard). → R-22.9.
- **Invariant 2 — autonomy never silent.** Every autonomous draft logs an `auto_drafted` audit, spot-reviewable. → R-22.10.
- **Invariant 7 — manage by exception.** No eligible vendor → surface (no_candidates), don't force a dispatch. → R-22.11.

The **compliance floor is fail-open-with-flag and TEMPORARY** (Phase-5 D-5.2): with `vendor_compliance` empty today, an absent row is recorded as `no_data` (eligible-but-recorded, snapshotted), and the auto-dispatch path stays at DRAFT; when compliance data lands the exclude predicate tightens to a hard gate with **no schema change**. The remaining §2 invariants (opt-in autonomy enablement, the spend/kill-switch guardrail layer, condition vocabulary) belong to **Phase 23+** and are explicitly **not** affirmed here.
