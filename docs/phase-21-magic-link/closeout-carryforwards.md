# Phase 21 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-20-vendor-edge/closeout-carryforwards.md`, with the new Phase-21 items added. **Phase 21
RETIRES NOTHING** — it is a pure build phase; the **entire inherited bank rolls forward UNCHANGED**
(including CF-13.4-open, CF-20.1/20.2/20.3, and **B-16.3, which stays OPEN** — see the disposition note
below).

## Discharged this phase (verified — NOT carry-forward)

**None.** Phase 21 built net-new linkless vendor access; it did not discharge any inherited backlog item.

> **Disposition note — B-16.3 is NOT retired (it stays OPEN).** The v2 roadmap (§6 line ~115 and §9
> line ~167) states "builds the vendor-direction publish target (retires B-16.3) … (Phase 21)."
> **This is wrong.** Per the live bank, **B-16.3 = (a) the operator chat UI + (b) a vendor-direction
> publish path for `update_rewrite_drafts`** — a `vendor_update`-sourced rewrite draft that today lands
> `pending_review` with **no built outbound target** (`publishRewriteDraft` publishes client-direction
> only). Phase 21 built **neither**: it built magic-link **link** delivery — a new vendor-direction
> `communication_logs` send path (`sendAssignmentLink`), which only **partially unblocks** the
> outbound-channel infrastructure (a vendor-direction outbound on `communication_logs` now has a working
> precedent), but does **not** publish a rewrite draft and builds **no chat UI**. B-16.3 therefore
> **rolls forward OPEN** below. The roadmap text needs a separate doc-fix — tracked as **CF-21.1**
> (analogous to CF-19.4 / CF-20.3). **This is the third recurrence of the §6/§9 over-attribution
> pattern** — see the standing watchpoint added below.

## New Phase-21 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-21.1** | **Roadmap §6/§9 B-16.3 doc-correction** — both sections wrongly claim Phase 21 "retires B-16.3," conflating B-16.3 (chat UI + `update_rewrite_drafts` vendor-publish path, **both unbuilt**) with the magic-link **link** delivery Phase 21 actually built (which only partially unblocks the vendor-direction outbound channel). | A gated edit to `02-gpt-project-roadmap-v2.md` §6 + §9 (record Phase 21 as a pure build phase; keep B-16.3 open, noting the partial unblock). | A roadmap doc-fix, separate from this phase; not edited here (matches CF-19.4 / CF-20.3 handling). The **third** time §6/§9 over-attributed a retirement. |
| **CF-21.2** | **Vendor account-claim / onboarding from linkless usage** — a vendor who has acted via a magic link has no path to a registered account that consolidates their prior linkless work. | A follow-up to invite the linkless vendor to create an account; **on account creation, link to the existing `vendor_id`** (the token carries vendor via `assignment.vendorId`) so prior linkless-token jobs/notes/photos consolidate under the registered account — the **linkless→registered bridge**. | Net-new onboarding funnel; out of the token-security scope of this phase. **Relates to FB-10a.1** (vendor/client invite & onboarding). |
| **CF-21.3** *(soft)* | **Mint-new-per-send token accumulation** — each Send mints a fresh token, so a re-sent assignment accumulates token rows. | A pruning/retention policy if row growth matters (not blocking; the revoke UI surfaces each token's state). | **By design** (every link independently revocable; no token resurrection). Low priority. |
| **CF-21.4** *(soft)* | **SMS link delivery** — the link is delivered email-only today. | A second `SendProvider` (e.g. Twilio SMS) behind the channel-agnostic Phase-19 send seam, plus a phone recipient on the contact. | The send seam is channel-agnostic but only email is wired. **Relates to CF-19.2** (Twilio SMS adapter). |

**Soft notes (open, low-priority):**
- **`APP_URL` is a new deploy-time variable** — the absolute base for `/link/<token>`; a wrong/unset
  value sends dead links (localhost fallback dev-only). An operations/deploy concern, documented in
  `04-admin-sop.md` / `10-known-limitations.md`.
- **Presigned-URL issuance window inherited from Phase 20** — a linkless image URL already issued
  survives token revocation until its ~5-minute expiry (authorization at issuance, not per-fetch).
- **Per-tenant/per-assignment token expiry** — the 7-day window is a fixed constant; a configurable knob
  is a later refinement.

## Inherited (roll forward, UNCHANGED — from the Phase-20 bank)

### Phase-20 banked items (open)
| Id | Item |
|---|---|
| CF-20.1 | Operator-side attachment reader + photo viewing (tenant-scoped reader + operator permission gate, not vendor author-scope; a viewing surface presigning via the same seam). |
| CF-20.2 | Orphan-object sweep (reconciliation of storage keys ↔ `job_attachments.storage_key`, or a transactional-outbox) — for the rare put-succeeds-then-insert-fails residue. |
| CF-20.3 | Roadmap §6/§9 CF-13.4 doc-correction — both sections wrongly claim "Retires CF-13.4 (Phase 20)," conflating CF-13.4 (email_attachments backend) with FB-10a.4 (vendor photos, the item actually retired). |
| — (soft) | `vendor_documents` could reuse the storage adapter (insurance certs, W-9s, licenses — shared NULL-`file_url` placeholder pattern). |
| — (soft) | FB-10a.4 legacy-placeholder backfill not performed (existing NULL-file `job_attachments` rows stay placeholders). |

### Phase-19 banked items (open)
| Id | Item |
|---|---|
| CF-19.1 | Business-hours-aware SLA/escalation clock (elapsed-business-hours over `client_location_hours` + `client_locations.timezone`). |
| CF-19.2 | Twilio SMS adapter (a second `SendProvider` impl). |
| CF-19.3 | No-same-day-on-site exception (blocked on CF-19.1). |
| CF-19.4 | Roadmap §9 CF-12 doc-correction (the non-existent "CF-12.x outbound send" + scrambled CF-12.1/CF-12.4 labels). |
| — (soft) | `change_orders.submitted_at` proxy (`nte_increase_requested` sorts by `updated_at`). |
| — (soft) | Resend `Idempotency-Key` vs `failed→sent` retry — verify at live-key wiring. |

### Phase-18 banked items (open)
| Id | Item |
|---|---|
| CF-18.1 | Queue original-source note — the cross-job draft queue omits the originating note body; operators click through to the job. |
| CF-18.2 | `(tenant_id, origin)` index on `job_notes` — `listVendorUpdates` does a tenant-prefix scan filtered on `origin`. |

### Phase-16 banked items (open)
| Id | Item |
|---|---|
| B-16.3 | Chat UI + vendor-direction publish target. **Stays OPEN** — neither half built by Phase 21; the magic-link send path only **partially unblocks** the vendor-direction outbound channel (see the disposition note above; doc-fix tracked as CF-21.1). |
| B-16.4 | Vendor performance reader + populate `vendor_performance_scores`. |
| B-16.5 | LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`). |
| CF-16.1 | `source_type` intent-tag enum value on `update_rewrite_drafts`. |
| CF-16.2 | Invoice-aging anomaly rule (extend `flagInvoiceAnomalies`). |
| CF-16.3 | `source_id` polymorphic-meaning doc (jobId for assistant drafts vs note/update row for the rewriter). |
| RAG-if-outgrows | RAG / embeddings retrieval if the curated knowledge layer outgrows model context. |

### Phase-15 banked items (open)
| Id | Item |
|---|---|
| B-15.1 | Snow service-log capture RUNTIME — fill `snow_service_logs` per dispatch (field/mobile execution surface). |
| B-15.2 | Live weather feed + auto-event-trigger (calls the same `declareSnowEvent` seam). |
| B-15.3 | Mass-op operator UI + snow operator screens. |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on accumulated review-confirm data + §2.5 relaxation. |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling). |
| CF-13.3 | Real deterministic + AI email extractor logic. |
| CF-13.4 | Email attachment physical-storage backend (`email_attachments.storage_ref`). **Partially unblocked** by the Phase-20 R2 `StorageProvider` seam — email ingestion needs only to wire it; still OPEN. |
| CF-13.5 | Email→client resolution column (`external_system_id` on `email_ingestion_accounts`). |
| CF-13.6 | Email approve→link orphan window (source_external_id reader guard). |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface). |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform). |
| CF-12.2 | Live external adapter (real fetch/push HTTP). |
| CF-12.3 | Operator mapping UIs (external_*_mappings management). |
| CF-12.4 | Credential encryption-at-rest. |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. *(CF-21.2 — the linkless→registered bridge — relates here.)* |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open — roll forward)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list). |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal). |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM). |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template). |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper). |
| CF-14.3 | PM program/schedule CRUD UI. |

## Standing watchpoints (carried forward)

- **pnpm not npm** (an `npm install` crashes npm's arborist against the pnpm `node_modules`).
- **Name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2).
- **MariaDB-JSON parse-at-read**; read verdicts from a file + true exit.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only;
  better-auth NULL-tenant audit rows.
- **Snow naming care** — `snow_events` (storm batch header) ≠ `job_events`; `snow_dispatches`
  (per-site spawn/outcome) is NOT a vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose
  FK callback references it. (Reconfirmed in Phase 21: `magic_link_tokens` went in its own schema file
  so its referrers' FK callbacks resolve.)
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs` (a dead
  forward-decl). (Phase-18 finding.)
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load (dotenv non-override) — confirm the
  resolved DB name before any prod DDL. (Phase-19 finding.)
- **Storage seam is capture-by-default** — real R2 needs the four `R2_*` env vars; `STORAGE_FORCE_FAIL`
  is a test-only capture hook, never set in production. (Phase-20 finding.)
- **Send seam is capture-by-default** — real email needs `RESEND_*`; `SEND_CAPTURE=1` forces capture.
  **`APP_URL` is a NEW deploy-time var** — the absolute base for magic links; wrong/unset = dead links.
  (Phase-21 finding.)
- **Never store/log the raw magic-link token** — only its `sha256` hash; the raw value lives in the
  email body and the URL, nowhere server-side. `resolveMagicLinkToken` returns one quiet `{ok:false}`
  (no reason branch, no throw); token-side readers gate on `source_token_id`. (Phase-21 finding.)
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), and now **CF-21.1
  (B-16.3)** are the running list of §6/§9 retirement claims unsupported by the live bank. **Verify any
  "retires X" claim against the live bank text before acting on it** (the Phase 19/20/21 lesson:
  live bank wins over roadmap §6/§9).
