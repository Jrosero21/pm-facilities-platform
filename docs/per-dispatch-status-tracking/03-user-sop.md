# Per-Dispatch Status Tracking — User SOP (Operator)

## Setting a dispatch's status by hand

When a vendor calls or texts in an update (instead of using their magic-link portal):

1. Open the job → the **Dispatch** section → click the dispatch (assignment) to open its workspace
   (`/jobs/<id>/dispatch/<assignmentId>`).
2. Use **Set status** (the picker beside the status badge). It offers every status **except** Draft, Sent,
   and the dispatch's current status.
3. Pick the status the vendor reported (Accepted, Scheduled, Confirmed, On Site, Work Complete, Declined,
   Cancelled) and **Update status**.

Notes:
- **Draft → Sent is not here.** To send a dispatch, use the **Send dispatch** button (only shown while the
  dispatch is a Draft). Send also notifies the vendor and moves the job to Dispatched.
- You can move a dispatch to **any** status, including re-opening a Cancelled/Declined/Work-Complete dispatch
  (free movement — you're reconciling reality). Setting the status it's already at does nothing.
- Setting a status records the status change only — it does **not** create a check-in/ETA record (those come
  from the vendor actually doing the work).

## What happens to the JOB automatically

If the job has **exactly one active dispatch**, the job status follows the dispatch:
- Dispatch → **On Site** ⟹ job → **In Progress**.
- Dispatch → **Work Complete** ⟹ job → **Pending Invoice** (operationally done, ready for billing).

If the job has **more than one** active dispatch (multiple vendors), the job status does **not** move
automatically — set the job status by hand. A job that's **On Hold** is never auto-advanced. The job never
moves backward from an automatic milestone.

"Pending Invoice" is the handoff to billing: the work is done; accounting takes it from there
(invoice → Closed (Billed)).
