# Phase 12 — Carry-Forwards

The canonical home for every banked item. Discharged items recorded as verified; open items roll forward with an id.

## Discharged this phase (verified — NOT carry-forward)
| Item | Evidence |
|---|---|
| Source-agnostic ingest (§2.1) | harness A1–A4, green @ `66b1377` |
| Mapping correctness incl F5 priority tenant-dim | harness B1–B4 |
| Tenant isolation (9 tenant-carrying external_* tables) | harness C1–C4 |
| No-credential-leak + OQ-6 (no margin outbound) | harness D1–D5 |
| Locked behaviors (IF-7 park / auto-stub / IF-3 dedup / adapter / normalizePayload) | harness E1–E6 |
| §2.1 zero-core-change-to-add-a-provider | 12j: `git diff core/` empty |

## New Phase-12 carry-forwards (open)
| Id | Item | Disposition |
|---|---|---|
| **CF-12.1** | **Full-workflow auto-push** — ANY client-relevant job change (status OR client-visible note) auto-pushes to the mapped external platform. Needs: `pushNote` on the adapter interface; scope-guarded enqueue hooks in `createJob`/`sendDispatch`/`markBillingClosed` + the client-visible-note writer; `portal_update_queue` auto-drain. | live-integration phase (the activation work) |
| **CF-12.2** | **Live adapter** — real `fetchWorkOrders`/`pushStatus` HTTP for ServiceChannel (+ future providers); replaces the no-op skeleton. | live-integration phase |
| **CF-12.3** | **Operator mapping UIs** — admin screens to manage `external_client/location/status/trade/priority_mappings` + review parked WOs and auto-created location stubs. | operator-portal / live-integration phase |
| **CF-12.4** | **Credential encryption-at-rest (F1)** — decide + implement the `encrypted_payload` mechanism (app-layer encrypt + `key_ref`/KMS) when the first live adapter stores a real secret. | live-integration phase |
| **CF-12.5** | **IF-4 orphan window** — job-created-before-link has no source_external_id reader to guard re-ingest; build the reader (or fold the link into job creation) if duplicate-on-failure is ever observed. | hardening, when needed |

## Inherited (roll forward, unchanged)
| Id | Item |
|---|---|
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–12) — schema-hygiene at a boundary |
| FB-10a.1/.3 | Operator vendor/client-updates inbox + invite/onboarding flow |
| FB-10l.2/.3 | Visibility-promotion workflow (operator-manual); `requires_review` undefined |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`/`'client'`) |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture |

## Standing watchpoints (next phase)
- **WP-12.1** — on this multi-DB server, ALWAYS name `jonnyrosero_pm` / `jonnyrosero_pm_sandbox` explicitly; a bare connection lands on another DB.
- **WP-12.2** — pre-name FKs in schema source; the long `external_*` table names make drizzle's auto FK names exceed MySQL's 64-char limit (the `check-migration-identifiers` guard catches it).
- **MariaDB-JSON-read gotcha** — `json` columns round-trip as raw STRINGS on read (drizzle doesn't auto-parse); parse at the read boundary (the `drafts.ts:110` precedent). Re-surfaced in the 12k harness (caused A4/B4 to fail until the read was parsed).
- **§10 buffering discipline** — read harness/tsc verdicts from the captured file + the true exit code, NEVER an interleaved console. The twice-seen lesson: a console-read produced a **false-green** in 12k that was committed and had to be `reset --soft` and re-verified. Never commit a gate on a console-read result.
- **Standing (from earlier phases):** `job_status_history` index growth; TZ-skew (DB-clock intervals in seeds); route-level `loading.tsx` only; better-auth NULL-tenant audit rows.

## Recommended next-phase focus
Phase 13 — email ingestion (roadmap §8). The CF-12.1 live-integration activation is the parallel track whenever a real provider is onboarded; it builds entirely on the framework + adapter pattern this phase proved.
