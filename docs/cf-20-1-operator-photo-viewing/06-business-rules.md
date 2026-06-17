# CF-20.1 — Business Rules

- **BR1 — Operators can view vendor photos on jobs in their tenant.** Tenant + job scoped. Not author-scoped (an operator is not the uploading vendor).
- **BR2 — No existence leak.** A photo outside the operator's (tenant, job) scope is indistinguishable from a nonexistent one (`forbidden` either way). Arbitrary attachment ids cannot be probed for existence.
- **BR3 — Photos are internal, captured-then-review (§2.3).** Vendor photos land `internal_only` and are visible to operators but never auto-promoted to client-visible. This surface does not change client visibility; vendor→client promotion remains operator-gated (and deferred, FB-10l.2).
- **BR4 — Only active photos shown.** `status='archived'` photos are excluded from both the list and the URL reader.
- **BR5 — Photos only.** The reader filters `attachment_type='photo'`; non-photo attachments (e.g. vendor-invoice documents) are out of scope and return `forbidden` from the photo URL reader.
- **BR6 — Honest degrade, never a broken image.** When a photo's file can't be served (no R2 yet, or a title-only record), the operator sees an "Unavailable" tile, not a broken-image icon or a dead link.
- **BR7 — Viewing among authorized viewers is ungated.** Any role that can open the job (operations or finance) can see its photos. Deliberate deviation from the banked "operator permission gate" spec (02-decisions.md D4) — the reader's scoping is the security boundary.
