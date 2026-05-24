# Phase 0 — System Workflows

## Status
**N/A for Phase 0.**

No application code runs in Phase 0. There are no background jobs, no event flows, no integrations, no AI pipelines, and no inbound/outbound message handlers to document.

## What Phase 0 did establish
The **shape** in which future system workflows will be documented:

- Each phase that adds a system workflow gets an entry in its own `05-system-workflows.md`.
- Each workflow entry should name the trigger, the source(s) of input, the side effects, the history/event rows written, and the failure mode.
- Workflows that span phases (e.g., a job's lifecycle from intake → dispatch → completion → billing) should cross-link forward and backward between phase docs.

## Forward pointers
- Phase 1: auth session lifecycle, tenant resolution on request.
- Phase 4: job intake (manual), status transitions, history writes.
- Phase 5: dispatch flow.
- Phase 6: outbound/inbound communication logging.
- Phase 12+: integration sync workflows.
- Phase 13: email-to-work-order parser.
