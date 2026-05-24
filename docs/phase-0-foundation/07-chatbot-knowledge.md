# Phase 0 — Chatbot Knowledge

The chatbot/AI assistant ships in **Phase 16**. Phase 0 contributes background facts the assistant will need to answer "what is this platform and how is it organized?" questions.

## Knowledge items

### K-0.1 — Project identity
The PM Facilities Platform is an aggregator-first work-order operating system. It coordinates jobs across many input sources, dispatches to vendors, captures vendor updates, and (eventually) exposes vendor and client portals plus an AI operations assistant.

### K-0.2 — Source-agnostic by design
The platform does not assume any single intake channel. ServiceChannel is one of several possible sources, alongside other external portals, email ingestion, the internal client portal, manual entry, API, PM schedules, and snow events.

### K-0.3 — Phased build, 17 phases
Phases 0 through 16. Foundation first (Phase 0), then auth (1), reference data (2–3), jobs/dispatch/comms (4–6), AI scope (7), billing (8), aggregator dashboard (9), portals (10–11), integrations (12), email ingestion (13), PM (14), snow (15), chatbot (16).

### K-0.4 — Documentation contract
Each phase ships eleven docs (`01-phase-summary.md` through `11-closeout.md`) under `docs/phase-N-<name>/`. The assistant can answer questions about a phase by reading that phase's doc set.

### K-0.5 — Audit-first operating philosophy
Status changes, assignments, communications, and integration events are recorded as history/event rows. The assistant can therefore reconstruct timelines, not just current state.

## Phase 0 operational knowledge for the assistant
**N/A.** Phase 0 has no operational data to reason about. Operational knowledge (job states, dispatch logic, vendor coverage, etc.) accrues phase by phase.
