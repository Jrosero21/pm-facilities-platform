# Phase 15 — Closeout

**Branch:** `phase-15-snow-operations` · **Commits:** `088e7a6 → bd5f7cb → 01e3115 → 6e0c8ba` (local, not pushed) · **Target tag:** `v1.6.0-phase-15`.

## Phase goal

Deliver the **event-triggered batch engine** — Snow Operations, the second "software within a software", parallel to the time-triggered PM engine: a declared storm fans out across a client's enrolled sites into a batch of jobs, reusing the existing dispatch workflow.

## Completed deliverables

- **8 snow tables** (0039/0040/0041), sandbox + prod applied + contract-verified.
- **Event-fire engine** (`src/server/snow/`): `declareSnowEvent`, `dispatchSnowEventSites` (shared workhorse), `confirmSnowDispatches`.
- **Phase-blocking harness** (`scripts/check-snow-dispatch.ts`): **23 / 0 green**, sandbox-only, self-seeding.
- **9 forks resolved + locked** (F15-A…I) + decision-A weather-FK completion + materialize-at-declare.
- **11 standard docs + carry-forwards** (this set).

## Files created / changed

- `src/server/schema/snow.ts` (new; 8 tables) + `src/server/schema/index.ts` (barrel `+ export * from "./snow"`).
- `db/migrations/0039_tearful_princess_powerful.sql`, `0040_gray_power_man.sql`, `0041_charming_william_stryker.sql` + `_journal.json` + 3 snapshots.
- `src/server/snow/{declare-event,dispatch-sites,confirm-dispatches,index}.ts` (new).
- `scripts/check-snow-dispatch.ts` (new) + `package.json` (the `db:check:snow-dispatch` alias).

## DB changes

Prod base tables 107 → **115**; 8 `snow_*` tables; **25 snow FKs** (16 CASCADE / 4 RESTRICT / 5 SET NULL); 2 enums (`event_status`, `dispatch_status`); `photo_refs` longtext; `fk_sevent_weather` completed in 0041. Full detail in `08-db-changes.md`.

## API / server functions

Three `"server-only"` fns (no HTTP routes — UI defers, B-15.3); signatures + throws in `09-api-routes.md`.

## Workflows

declare → materialize-at-declare snapshot → (auto | stage→confirm) → shared workhorse fans staged dispatches into `createJob(snow_event)` per site (skip-and-flag, no outer txn) → counts to audit → event complete. Full chain in `05-system-workflows.md`.

## Business rules

R-15.1…R-15.10, each citing its harness assertion group (A–G). See `06-business-rules.md`.

## Chatbot knowledge

Q&A surface for the Phase-16 assistant in `07-chatbot-knowledge.md`.

## Verification

- **Harness 23/0 green** @ `6e0c8ba` (sandbox): declare+materialize / stage-gate / auto-dispatch / skip-and-flag / idempotent re-fire / cross-tenant / empty-fire.
- **Prod contract-verify** per migration: tables present, FK matrices identical to sandbox (25 FKs), enums + defaults correct, `photo_refs` longtext.
- **Prod table count: 115** (8 snow); typecheck `exit=0` at each stage; id-guard OK (all identifiers ≤ 64).

## Known limitations

Weather feed/auto-trigger deferred (B-15.2); service-log capture runtime deferred (B-15.1); operator UI + mass-op deferred (B-15.3); dashboard read surface deferred (B-15.4); counts in audit not columns (CF-15.1). Process notes (id-guard not a pnpm alias; weather-FK declaration ordering) in `10-known-limitations.md`.

## Carry-forward items

New: B-15.1, B-15.2, B-15.3, B-15.4, CF-15.1. Inherited (CF-13.x, CF-12.x, FB-10x, CF-11.x) roll forward unchanged. See `closeout-carryforwards.md`.

## Recommended next-phase focus

**Phase 16 — the assistant / chatbot** (per the roadmap) — `07-chatbot-knowledge.md` (this phase) + the PM/reactive knowledge surfaces are the grounding corpus. Snow + PM + reactive now share one job model, so the assistant can reason across all three batch/reactive shapes.

## Remaining (post-closeout, gated)

Commit the closeout docs, then the **gated origin sequence**: push the 4 implementation commits + docs, tag `v1.6.0-phase-15`, open the `phase-16` branch. (Not done in the doc-authoring batch.)
