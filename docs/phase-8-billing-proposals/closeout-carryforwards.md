# Phase 8 — Closeout Carry-Forwards

Items that must be resolved or recorded **before** the Phase 8 closeout (`11-closeout.md`) and the `v0.9.0-phase-8` tag. Accumulated across the 8b/8c gates; each entry names what must happen and who/what gates it. Distinct from deferred-feature forward-flags (those live in `8b-schema-plan.md §8` and will roll into `10-known-limitations.md`).

---

## CF-8b.1 — Run §7.5 fresh-migration verification against a scratch DB before tagging

**What.** The 8b verify (this gate) substituted a **non-destructive drift check** (`pnpm db:generate` → "No schema changes, nothing to migrate") for §7.5's full byte-identical from-scratch rebuild, because the live dev DB carries the Phase 4–7 worked-example data (Jobs #1–3, dispatch, scope) and a real drop-and-rebuild would wipe it.

**Obligation (before closeout / tag).** Run the full **from-scratch migration rebuild** (`0000`→`0023`) against a **scratch/throwaway database** and confirm the resulting schema is byte-identical to the worked-DB schema — the Phase-7-precedent verification (`docs/phase-7-ai-scope-generation/11-closeout.md`: "the three applied byte-identically from-scratch"). Capture the result in `11-closeout.md`.

**Blocker condition.** If the from-scratch rebuild **diverges** from the worked-DB schema, that is a **blocker for the `v0.9.0-phase-8` tag** — investigate and reconcile before closeout.

**Refs.** `8b-schema-plan.md §7.5`; 8b verify-review (drift-check substitution flagged at apply).

---

## CF-8c.1.1 — NTE-rule archive should emit a billing event (audit trail)

**What.** In 8c.1, `archiveClientNteRule` is a **silent state change** (`active|archived → archived`) — no audit/event row. NTE-rule lifecycle changes (create / activate-supersede / archive) are tenant billing-config edits that should eventually be auditable.

**Obligation (closeout-tracked, NOT 8c.1 scope).** Add a `billing_config.*` taxonomy entry (e.g. `billing_config.nte_rule_archived` / `.created` / `.activated`) emitted on NTE-rule lifecycle changes. The natural home for the emit is **wherever NTE-rule admin lives** (8c.11e UI) or a future config-audit follow-on — decide there. `emitJobBillingEvent` is job-scoped, so a config-level event may need a different sink (config events are not job-scoped); flag that shape question when implemented.

**Refs.** 8c.1 pre-DB review (archive is a silent state change); 8c-construction-plan §2 (8c.1).
