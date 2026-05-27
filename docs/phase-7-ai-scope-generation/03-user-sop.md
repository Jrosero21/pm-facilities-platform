# Phase 7 — User SOP

Procedures for an aggregator user (operator/tenant_admin) generating and publishing a job's **scope of work**. All screens live under the protected `(app)` shell and act within your active tenant. The scope lives in the **Scope of work** section on a job (`/jobs/[id]`), between *Problem description* and *Dispatch*. Builds on Phase 4 (jobs) and the Phase 6 draft-review pattern. (Runtime mechanics + rationale: `05-system-workflows.md`.)

## SOP-7.1 — Generate a scope from the problem description
1. Open a job (`/jobs/[id]`) and find the **Scope of work** section. If no scope exists yet, it shows a **Generate scope** button and *"No scope generated yet."*
2. Click **Generate scope**. The AI reads the job's problem description + client/location/trade/priority and drafts an ordered technician scope. (~A few seconds; "Generating…" shows.)
3. The draft lands in **Pending review** as a collapsed row (confidence badge + step count + first step). It is **never** applied to the job automatically — it's a draft you review. (You can generate again — each run adds a new pending draft. Mirrors WF-7.2.)

## SOP-7.2 — Review a draft
- In **Pending review**, click **Review** on the draft. You see the AI's **assumptions**, its **rationale** and **confidence**, and the **editable step list** (each step: instruction, an optional category, and an "expects photo" flag).
- Confidence is **diagnostic of input quality** — a vague problem description tends to yield *medium*/*low* confidence with assumptions naming the gaps; a specific one yields *high*. Read the assumptions: they tell you what the AI inferred and where to correct it.

## SOP-7.3 — Edit the steps
In the expanded draft, adjust the steps to match the real job:
- **Rewrite** a step's instruction text; **change its category** (assess / perform / cleanup / verify / document); **toggle "expects photo."**
- **Reorder** steps with ▲/▼ (disabled at the ends); **remove** a step with ×; **add** a step with **+ Add step** (then type its instruction).
- Editing is yours until you Approve — nothing is saved until then. (A scope must have at least one step, each with instruction text, or Approve is refused.)

## SOP-7.4 — Approve, reject, or discard
- **Approve** (after any edits) → the draft moves to **Ready to publish**. If you edited, the published scope reflects your edits and is marked operator-edited; if you didn't, it's marked AI-generated. The AI's original steps are preserved for the record either way.
- **Reject** (requires a reason) or **Discard** (silent) → the draft moves to **Dismissed** (collapsible history; rejected and discarded are shown distinctly). Mirrors WF-7.3.

## SOP-7.5 — Publish the approved scope
- In **Ready to publish**, click **Publish scope**. The scope is saved to the job as its structured steps and rendered as a numbered **Scope of work** list; the job's scope status becomes *approved*. (This is also what dispatch reads as the approved scope.) Mirrors WF-7.4.

## SOP-7.6 — A job that already has a published scope
- Once a scope is published, the **Generate scope** button is **gone** and the section shows *"Scope published. Re-scope is not yet supported."* — Phase 7 supports one published scope per job (re-scope is a future feature).
- If you had a second draft approved when you published the first, that leftover draft shows *"Scope already published for this job…"* with **no Publish button** but a **Discard** control — discard it (or leave it as history). Mirrors WF-7.6.

## Worked examples
- **Job #1 (toilet clog).** Generated a **9-step** scope (assess the fixture → clear the blockage → test → clean → document with photos). The operator agreed with it, **approved with no edits**, and published — 9 steps, AI-generated.
- **Job #2 (rooftop HVAC not cooling).** Generated a **14-step** draft. The operator reordered the opening steps, rewrote one, changed a category, toggled a photo flag, added a "document with photos" step, and dropped several steps that didn't apply — publishing **8 operator-edited** steps. The job's *generated* scope (the AI's original 14) and *approved* scope (the operator's 8) differ, by design.

## What users cannot do yet
- **Apply a scope template** — templates don't exist in the UI yet (the tables are empty placeholders).
- **Re-scope a job** that already has a published scope (the trigger is hidden; L-7.7).
- **Auto-generate** on job creation — generation is always a manual click.
- **Configure per-client scope policy** — every scope requires review; there is no auto-publish.
- **See generation cost/usage** in the UI — runs are logged in the agent substrate, but there's no operator-facing cost view (Phase 9 analytics).
