# Phase 13 — Carry-Forwards

The canonical home for every banked item. Discharged items recorded as verified; open items roll forward with an id.

## Discharged this phase (verified — NOT carry-forward)
| Item | Evidence |
|---|---|
| Record-don't-apply ingest (no job at ingest) | harness B1–B4, green @ `5c47718` |
| Dedup flag-don't-reject (incl. live NON_UNIQUE index) | harness C1–C3 |
| Approve → job attribution (email_ingestion / system / NEW / message-id) | harness D1–D4 |
| Readiness gates + one-time-review + tenant isolation | harness E1–E5 |
| D-7 parser-rules config-only (no client→id) | harness F1 (live schema) |
| Source-agnostic reader seam (unknown-kind throws) | harness A1–A3 |
| §2.1 zero-core-change-to-add-a-reader | 13f: a reader = a folder + one registerReader line |

## New Phase-13 carry-forwards (open)
| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-13.1** | **Autonomous high-confidence auto-create** — above-threshold known formats create a job directly, skipping the review queue. | A confidence threshold + a branch calling `createJobFromDraft` after the check (the seam + the continuous `confidence` field are built NOW). | Gated on accumulated review-confirm data + a §2.5 relaxation. Records Jonny's stated long-term autonomy intent. |
| **CF-13.2** | **Live email receiver** — IMAP / webhook / mailbox polling that creates `inbound_emails` rows. | The transport layer + auth to the mailbox. | Activation work; the engine already consumes stored rows. |
| **CF-13.3** | **Real deterministic + AI extractor logic** — per-format field rules + the AI-assist prompt. | Sample emails to tune/test against; drop into the existing stub seams. | No real emails exist yet; stubs route everything to review. |
| **CF-13.4** | **Attachment physical-storage backend** — where `email_attachments.storage_ref` bytes live. | An object-store/disk destination + write path. | Reference shape exists; no blob backend pattern in the platform yet. |
| **CF-13.5** | **Email→client resolution column** — add `external_system_id` to `email_ingestion_accounts` so the frozen `external_client_mappings` resolver keys off it (D-1). | A small additive migration + flip `accountExternalSystemId` from `null` to `account.externalSystemId` at the (already-written) resolution site. | Dormant-but-correct today; needs a real parser producing client codes to be meaningful. |
| **CF-13.6** | **Approve→link orphan window** — job created, then the draft-link update finds the draft changed (0-row guard). | A job-lookup-by-source_external_id guard (or fold the link into job creation). | IF-4 / CF-12.5 analog; re-check-guarded + audited (`email_draft.approve_link_orphan`), not thrown. Hardening, when observed. |
| **CF-13.7** | **Operator review-queue UI (+ AI-assist invocation surface)** — screens to triage `pending_review` drafts, resolve client/location/codes, approve/reject, and invoke the AI-assist reader. | The action wrapper (requireTenant/requireRole) + the React surfaces. | Operator-portal phase; the data/API layer + wrappers exist and are harness-proven. |

## Inherited (roll forward, unchanged — from the Phase-12 bank)
| Id | Item |
|---|---|
| CF-12.1 | Full-workflow auto-push (any client-relevant job change → mapped external platform; pushNote + enqueue hooks + portal_update_queue drain) — live-integration phase |
| CF-12.2 | Live external adapter (real fetchWorkOrders/pushStatus HTTP) — live-integration phase |
| CF-12.3 | Operator mapping UIs (external_*_mappings management + parked-WO / auto-stub review) — operator-portal phase |
| CF-12.4 | Credential encryption-at-rest (external_credentials.encrypted_payload mechanism) — when the first live adapter stores a secret |
| CF-12.5 | External-ingest IF-4 orphan window (source_external_id reader guard) — hardening, when needed |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–13) — schema-hygiene at a boundary |
| FB-10a.1/.3 | Operator vendor/client-updates inbox + invite/onboarding flow |
| FB-10l.2/.3 | Visibility-promotion workflow (operator-manual); `requires_review` undefined |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`) |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture |

## Standing watchpoints (next phase)
- **WP-13.1** — `inbound_emails` (Phase 13, raw mail intake) must NOT be confused with the Phase-6 `inbound_messages` (communication-log inbound channel rows). Distinct purpose, distinct table.
- **WP-13.2** — a stale `tsconfig.tsbuildinfo` (incremental cache) replays PHANTOM `tsc` errors (e.g. cross-script "Cannot redeclare"). If tsc errors don't match the source, `rm -f tsconfig.tsbuildinfo` and re-run. It is gitignored.
- **Inherited:** WP-12.1 (name the DB explicitly on this multi-DB server), WP-12.2 (pre-name FKs — long table names exceed MySQL's 64-char auto-name limit), MariaDB-JSON parse-at-read (`json` cols round-trip as raw strings), §10 buffering discipline (read verdicts from the captured file + true exit code, never an interleaved console; the phantom-modified-schema + stale-tsbuildinfo false alarms this phase were both caught this way).
- **Standing (earlier phases):** `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth NULL-tenant audit rows.

## Recommended next-phase focus
Phase 14 — Preventative Maintenance (roadmap). The email-ingestion activation track (CF-13.1/.2/.3/.7) is the parallel work whenever email goes live.
