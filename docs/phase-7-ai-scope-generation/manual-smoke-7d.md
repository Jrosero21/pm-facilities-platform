# Phase 7 — 7d operator UI manual smoke

A human-driven click-through of the complete scope-generation operator surface, run against
`pnpm dev`. Scripted verification (7d.1/7d.2/7d.3) already covered logic, data round-trips,
the publish gate, and compilation; **this checklist covers what only a human at the browser
can confirm: rendering, interaction, and operator experience.**

Each item is **a specific action → a specific observable result.** Tick each; note any gap.

## Prerequisites
- `pnpm dev` running, logged in to the Demo Aggregator tenant.
- Jobs **#1** and **#2** already have **published** scopes (from 7c/7d.3 verification) — use them
  for the *published-state* checks (§5). The *active-flow* checks (§1–§4) need a **fresh job**.

## 0. Setup — create a fresh job (the active flow §1–§4 needs a `not_started` job)
The `/jobs/new` form is five required selects/fields + one optional, top to bottom. The
**Location** select is **disabled until a Client is chosen** and **resets if you change the
Client** (it's filtered to the selected client).
- [x] Go to `/jobs/new`.
- [x] **Client** → pick any client from the dropdown (placeholder *"Select a client…"*). →
  The **Location** select becomes enabled (its placeholder changes from *"Select a client
  first"* to *"Select a location…"*).
- [x] **Location** → pick a location under that client. (If you re-pick the Client, this resets
  to its placeholder — re-select a location.)
- [x] **Trade** → pick any trade (e.g. *HVAC* or *Plumbing*) — required; scope generation uses
  it as context.
- [x] **Priority** → pick any priority (e.g. *Standard*).
- [x] **Problem description** (required textarea) → e.g. *"Walk-in freezer not holding
  temperature; compressor runs but box stays warm."*
- [x] **Initial scope** (optional) → leave blank.
- [x] Click **Create job**. → Lands on `/jobs/[id]`; note the **job #**. The **Scope of work**
  section shows a **"Generate scope"** button and *"No scope generated yet."*

## 1. Generate
- [x] On the fresh job, find the **"Scope of work"** section (between *Problem description* and
  *Dispatch*). → A **"Generate scope"** button is present; below it, *"No scope generated yet."*
- [x] Click **Generate scope**. → Button shows *"Generating…"*; after a few seconds the page
  refreshes and a **"Pending review (1)"** group appears with one collapsed draft row
  (confidence badge + *"N steps · {timestamp}"* + the first step text).

## 2. Review — collapse / expand
- [x] Click **Review** on the pending row. → The row expands: **Assumptions** list, **Rationale**
  line, the editable **step list**, and Approve / Reject / Discard controls.
- [x] Click **Close**. → The row collapses back to the summary.

## 3. Edit affordances (re-expand the draft)
- [x] **Rewrite:** edit a step's instruction textarea. → Text updates in place.
- [x] **Category:** change a step's category select (e.g. `—` → `Verify`). → Selection updates.
- [x] **Expects photo:** toggle a step's checkbox. → Checkbox flips.
- [x] **Reorder:** click ▲/▼ on a middle step. → The step swaps position. Confirm ▲ is
  **disabled** on the first step and ▼ is **disabled** on the last step.
- [x] **Remove:** click **×** on a step. → The step disappears; remaining steps renumber.
- [x] **Add step:** click **+ Add step**. → A new empty step appends at the end with category `—`
  and expects-photo unchecked.
- [x] **Empty-instruction guard:** leave the added step's instruction blank and click **Approve**.
  → Inline red error: *"A scope needs at least one step, each with instruction text."* (no state
  change).

## 4. Dispositions (use fresh generated drafts — one per verb)
- [ ] **Approve (no edit):** generate a draft, expand, click **Approve** without editing. → Draft
  moves to a **"Ready to publish"** group showing the steps read-only + a **Publish scope** button.
- [ ] **Approve (with edits):** generate another draft, make ≥1 edit, **Approve**. → Moves to
  *Ready to publish*; the displayed steps reflect your edits.
- [ ] **Reject (with reason):** generate a draft, expand, type a reason, click **Reject**. → Draft
  leaves Pending. (Empty reason → inline error *"A reason is required to reject."*)
- [ ] **Discard:** generate a draft, expand, click **Discard**. → Draft leaves Pending silently.
- [ ] **Dismissed group:** expand the **"Dismissed (n)"** disclosure. → Both the rejected and the
  discarded drafts appear, each labelled with its **status word** (`REJECTED` / `DISCARDED`,
  uppercase) — the two are visually distinguished.

## 5. Publish + published state
- [x] With a *Ready to publish* draft on the fresh job, click **Publish scope**. → Button shows
  *"Publishing…"*; on refresh the **"Scope of work"** section now shows a **numbered list** of the
  published steps, **the "Generate scope" button is gone**, and the note *"Scope published.
  Re-scope is not yet supported."* appears.
- [x] **Sibling gate** (set up before publishing): generate **two** drafts, approve **both**, then
  publish **one**. → After publish, the **other** approved draft's row shows **no Publish button**
  and the note *"Scope already published for this job. This draft can no longer be published.
  Discard or leave as history."*
- [x] **Gated-sibling discard** (the 7d hotfix): on that gated approved sibling, confirm the
  **Discard** control is visible **alongside** the note. Click **Discard**. → The draft moves to
  the **Dismissed** group with status **`DISCARDED`**. → The **published scope on the parent job
  is unaffected** (same numbered steps, no change).
- [x] **Already-published job:** open Job #1 (or #2). → The Scope of work section shows the
  published numbered steps + the *"Scope published…"* note, and **no Generate button**.

## Result
- [x] All items pass → record "7d manual smoke: pass" in the closeout.
- [x] Any gap → note it; triage as **blocking UX defect** (hotfix before docs/tag) or
  **acknowledged limitation** (KL entry, defer).
