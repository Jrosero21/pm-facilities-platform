# Per-Dispatch Status Tracking — Chatbot Knowledge

Concise facts for the operator assistant.

- **A dispatch is a vendor's trip on a job.** Status lives on the dispatch, not the job. One job can have
  many dispatches (even the same vendor twice).
- **Dispatch statuses:** Draft → Sent → Accepted → Scheduled → Confirmed → On Site → Work Complete; plus
  Declined and Cancelled (terminal).
- **Operators can set a dispatch status by hand** on the dispatch workspace ("Set status"), e.g. when a vendor
  phones in. They can move it to any status (including re-opening a cancelled one). They can't set Draft or
  Sent — Sending is the "Send dispatch" button.
- **The job can follow the dispatch automatically, but only when the job has exactly one active dispatch:**
  On Site → job In Progress; Work Complete → job Pending Invoice. With multiple vendors, the operator sets the
  job status by hand. A job On Hold is never auto-advanced; the job never moves backward.
- **"Pending Invoice"** means the work is operationally done and the job is waiting to be invoiced. Billing
  takes it from Pending Invoice to Closed (Billed).
- The job statuses, in order: New, Scheduled, Dispatched, In Progress, Pending Invoice, On Hold, Completed,
  Cancelled, Closed, Closed (Billed).
