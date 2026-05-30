# Phase 10 — Vendor Portal MVP · User SOP

For **vendor users**. What you see in the vendor portal and how to act on it. (Internals are `05-system-workflows.md`; precise rules are `06-business-rules.md`; rationale is `02-decisions.md`.)

## §1 — Logging in

1. Go to `/login` and sign in with your vendor credentials.
2. If your account is a vendor user with at least one vendor org in this tenant, you land on **`/vendor/jobs`** automatically.
3. If your account has no vendor org mapped yet, you land on **`/vendor-no-access`** — contact your administrator to be granted access.
4. If you also hold an operator-class role, you default to the aggregator dashboard (`/dashboard`); reach the vendor portal by navigating to `/vendor/jobs` directly. (A dedicated switcher is a future addition — `FB-10i.1`.)

## §2 — Viewing your assigned jobs

`/vendor/jobs` lists every assignment dispatched to your vendor org(s) in this tenant — **only yours**, and only after a dispatcher has **sent** it (drafts are not shown). Each row shows the job number, client/location, trade, dispatch status, and scheduled time. Click a job number to open the assignment.

## §3 — Acting on an assignment

The assignment detail page (`/vendor/jobs/<id>`) shows an **Actions** panel whose available actions depend on the current dispatch status:

- **§3.1 Accept** (status `Sent`) — "Accept dispatch" moves the assignment to `Accepted`. You commit to the work.
- **§3.2 Decline** (status `Sent`) — the "Decline reason (optional)" box + "Decline" moves it to `Declined` (terminal). Your reason is recorded on the assignment history. You can only decline before accepting.
- **§3.3 Confirm ETA** (status `Accepted`) — the ETA form (start required, end + note optional) records your arrival window **and** schedules the visit, moving the assignment to `Scheduled`. Submitting an ETA *is* the scheduling act.
- **§3.4 Confirm schedule** (status `Scheduled`) — "Confirm schedule" moves it to `Confirmed`.
- **§3.5 Mark on-site** (status `Confirmed`) — "Mark on-site" records your arrival (a check-in) and moves it to `On Site`.
- **§3.6 Mark work complete** (status `On Site`) — "Mark work complete" records your departure (a check-out) and moves it to `Work Complete` (terminal).

When an assignment is closed (`Work Complete`, `Declined`, or `Cancelled`), the panel shows "This assignment is closed."

## §4 — Adding a note

In the **Notes** section, type into "Add a note" and submit. Your note is recorded as **vendor-originated** and is **internal by default** — an operator sees it (tagged "Vendor"), but it does not reach the client unless an operator makes it client-visible. You see your own org's notes plus any operator notes marked vendor-visible.

## §5 — Attaching a photo

In the **Photos** section, enter a title and "Attach placeholder." **File upload is not yet available** — this records a titled placeholder that a future release will attach the real file to. Placeholders are internal and visible to your org.

## §6 — Submitting an invoice

From the assignment detail page, "Submit invoice" opens the invoice form (`/vendor/jobs/<id>/invoices/new`):

1. Optionally enter an invoice number and date.
2. Add at least one **line item** (category, description, quantity, unit, unit price). "+ Add line item" adds rows; "Remove" deletes (you must keep at least one).
3. "Submit invoice." Totals are calculated automatically — you don't enter them.
4. You return to the assignment, where the invoice appears under **Invoices** with status `received`.

The operator's accounting team reviews and approves (or disputes) your invoice through their AP workflow. You see the status update but cannot edit line items after submission.

## §7 — What you cannot do (by design)

- **Cancel** an assignment (operator-only) — decline is your only back-out, and only from `Sent`.
- **Promote** a note or photo to client-visible (operator-side; not yet built — `FB-10l.2`).
- **Upload a real file** (placeholder only — `FB-10a.4`).
- **Edit invoice line items** after submission (Phase 8 line-item editing is operator-side).
- **Request an NTE increase** or **submit a quote** (deferred — `FB-10a.5a` / `FB-10a.5b`).
- **Revise an ETA** after confirming the schedule (`FB-10k.3`).
