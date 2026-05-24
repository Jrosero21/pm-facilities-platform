# Phase 0 — Business Rules

Phase 0 introduces no domain rules (no clients, vendors, jobs, dispatch, billing, etc.). It does establish **platform-level rules** that constrain every later phase.

## R-0.1 — Source-agnostic data model
No table, column, route, or component may be named after a specific external channel (ServiceChannel, a specific client portal, a specific email mailbox). Channel identity is always a value, never a structural assumption.

## R-0.2 — Server-side database access only
The browser must never connect directly to MySQL. All DB access goes through the server tier.

## R-0.3 — Auditability over overwrites
For any meaningful operational change (status, priority, assignment, communication, integration sync), a history/event row must be written in addition to (or instead of) overwriting the current-state field. Applies starting Phase 4.

## R-0.4 — AI output is a reviewable draft
AI-generated content (scopes, summaries, replies) is never delivered to a client or vendor without an explicit human review/promote action. Applies starting Phase 7.

## R-0.5 — Phase isolation
A phase ships only what its acceptance criteria require, plus harmless forward-compatible placeholders (e.g., `source_type` on jobs). Building unrelated future features inside a phase is a defect.

## R-0.6 — Closeout completeness
A phase is not "done" until all eleven docs (`01-…` through `11-closeout.md`) exist in its directory and the verification commands in `11-closeout.md` have been run.

## Domain rules
**N/A for Phase 0.** Domain business rules (tenant isolation, role permissions, job state machines, dispatch SLAs, billing logic, etc.) begin in Phase 1.
