# Phase 5 — User SOP

Procedures for an aggregator user (operator/tenant_admin) dispatching vendors to jobs. All screens live under the protected `(app)` shell and act within your active tenant. Builds on Phase 4 (creating/viewing jobs).

## SOP-5.1 — See a job's dispatches
- Open a job (`/jobs/[id]`). The **Dispatch** section lists the vendors dispatched to this job — each as a card with a status badge (amber **Sent** = awaiting the vendor's response), the vendor name, branch (or "Vendor-wide"), schedule, agreed NTE, and a one-line match summary ("Primary trade: HVAC · National service area · No compliance data"). Click a card to open the assignment.
- If the job has **no trade assigned**, the section shows "Assign a trade to this job before dispatching a vendor." (the matcher needs a trade). If no vendors are dispatched yet, it shows "No vendors dispatched yet."

## SOP-5.2 — Dispatch a vendor to a job
1. On the job detail page, **Dispatch a vendor** (top-right of the Dispatch section).
2. **Pick a vendor** — the form lists the vendors that match this job (capable for the trade + serving the area). If only one matches, it's pre-selected. Each shows *why* it matched: its primary trade, the service-area match, and compliance status. **"Primary trade: HVAC"** means HVAC is that vendor's primary specialty — not that they're your designated primary vendor (no such feature yet).
   - If **no vendors match**, the form explains what's needed (active coverage for the trade + a service area covering the location) and links back to the job. Add coverage on a vendor, or change the job's trade.
3. **Branch / Vendor contact** — pre-filled where there's an obvious choice; adjust if needed. "Vendor-wide (no branch)" is valid.
4. **Scheduled start** defaults to tomorrow 9 AM; **end / NTE** are optional. **Scope** is pre-filled from the job's approved/current scope (or, if none was written, from the problem description — the label tells you which); edit as needed.
5. **Create dispatch** → you land on the assignment workspace, status **Draft**. Nothing has been sent to the vendor yet.

## SOP-5.3 — Send a dispatch
- On the assignment workspace (status **Draft**), review the details and the **Match at dispatch** block, then click **Send dispatch**. The page refreshes to **Sent**, and the job moves to **Dispatched** (if it was New or Scheduled). Sending is the point at which the vendor is notified.
- A job can have **multiple** dispatches (re-dispatch, a second vendor for a multi-trade job, comparing offers). Sending another vendor when the job is already Dispatched records the new dispatch without changing the job's status.

## SOP-5.4 — Read the "Match at dispatch" block
The assignment workspace shows why the vendor was matched, **frozen at dispatch time**: the matched trade (and whether it was the vendor's primary trade), the tightest service-area match, the compliance posture, and whether the chosen branch carries the trade itself. These never change after the dispatch is created — the job's own scope/trade may evolve, but this snapshot is the record of the decision.

## Worked examples
- **Job #1** (Plumbing, New York NY, status New): opening it and clicking "Dispatch a vendor" shows **"No vendors match this job"** — no vendor has active Plumbing coverage serving NYC. The no-candidate path.
- **Job #2** (HVAC, New York NY): dispatched to **Sunbelt HVAC** (vendor-wide), status **Sent**, and the job is **Dispatched**. The dispatch card and workspace show "Primary trade: HVAC · National service area · No compliance data".

## What users cannot do yet
- Edit, archive, accept, decline, or cancel a dispatch (create + send + view only). Accept/Decline are vendor-side actions (Phase 10 vendor portal).
- Record an ETA, a check-in/out, or send/track a message — those tables exist but have no UI yet (Phase 6).
- Designate a "primary vendor" for auto-dispatch — the matcher is advisory; you pick every dispatch (a future feature).
- Move a job through other statuses (lift a hold, mark complete) — dispatch advances NEW/Scheduled → Dispatched only; broader transitions are later phases.
