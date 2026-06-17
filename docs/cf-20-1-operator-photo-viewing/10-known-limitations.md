# CF-20.1 — Known Limitations

## L1 — Panel is ungated (deviation from banked spec)
The Phase-20 banked CF-20.1 spec named "an operator permission gate." We shipped the Photos panel **ungated**, matching the sibling operational sections (Dispatch/Notes/Contacts are not visibility-gated). Any role that can open the job sees its photos. This is deliberate and reasoned (02-decisions.md D4) — the reader's tenant+job scoping is the security boundary, and gating would hide invoice-justifying photos from finance roles. Recorded as a limitation only in the sense that it diverges from the literal banked wording; if a future requirement genuinely needs photos hidden from some job-viewers, a section gate can wrap `<JobPhotosPanel>` (e.g. `{canOperate && ...}`).

## L2 — Live render blocked on R2 (CF-iii.1)
Real images do not render until the four R2 vars are set (dev `.env.local` + prod runtime). Until then every photo shows as an "Unavailable" tile (capture-by-default). The build is complete and the degrade is honest; **CF-20.1 is build-complete but retirement-pending the R2 live-verify** (an operator rendering a real photo). Shared blocker with the vendor-invoice-doc and CF-27.15 live-verifies.

## L3 — Orphan objects not swept (CF-20.2, still open)
A `put` that succeeds followed by a failed `insert` leaves an unreferenced storage object. CF-20.2 (orphan-object sweep) remains open and is untouched by this work. Low priority.

## L4 — Job-detail panel only (CF-20.1b banked)
Photos are viewable per-job, on the job-detail page. There is no cross-job photo feed (e.g. a "recent vendor photos across all jobs" view in the Phase-18 review inbox). That was deferred by decision and banked as **CF-20.1b**; the per-job panel fully discharges the banked CF-20.1 spirit.

## L5 — No pagination
The panel renders all active photos for a job. Jobs are not expected to carry photo counts where this matters; if high-volume jobs emerge, the list reader would need pagination (and the up-front presign map would need bounding).
