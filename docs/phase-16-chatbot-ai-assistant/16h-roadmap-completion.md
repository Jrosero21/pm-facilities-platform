# Roadmap Completion — PM Facilities Platform (Phase 0 → 16)

This replaces a next-phase handoff: **Phase 16 is the final roadmap phase.** This doc records
what the full platform now is, the complete table inventory, the §9 empirical correction, the
canonical post-MVP backlog, and recommended post-roadmap directions.

## The full platform — all 16 phases

| Phase | Area | What it delivered |
|------|------|-------------------|
| 0 | Foundation | Stack, conventions, project scaffolding. |
| 1 | Auth & tenancy | Multi-tenant identity, roles, the `requireTenant`/`requireRole` isolation guard. |
| 2 | Clients & locations | Client + location model, contacts, hours, NTE/billing rules. |
| 3 | Vendors | Vendor model, contacts, service areas, trade coverage, rates, compliance. |
| 4 | Jobs | The core job model, statuses, history, per-tenant job numbering. |
| 5 | Dispatch | Vendor assignment, dispatch messages, check-ins/outs, ETA confirmations. |
| 6 | Communications | The unifying communication-log spine; the agent substrate + update rewriter (draft→review→publish). |
| 7 | AI scope generation | The provider seam + scope generator (draft→review→publish), `ai_prompt_templates`. |
| 8 | Billing & proposals | Client/vendor invoices, proposals, change orders, payments, margin. |
| 9 | Aggregator dashboard & analytics | Open-jobs / stalled / SLA / dispatch-timing / queue readers. |
| 10 | Vendor portal | Vendor-scoped read/act surface. |
| 11 | Client portal | Client-scoped read/act surface. |
| 12 | External portal integrations | Source-agnostic external system mappings + sync. |
| 13 | Email ingestion | Inbound email → work-order draft substrate. |
| 14 | Preventative maintenance | Time-triggered PM programs/schedules → visit generation. |
| 15 | Snow operations | Event-triggered storm response: declare → materialize → confirm → spawn. |
| 16 | Chatbot & AI assistant | READ/DRAFT operations assistant over the whole platform (this phase). |

### The three operating surfaces + the AI surfaces

- **Reactive jobs** (Phases 4–6, 8) — the demand-driven core.
- **PM time-triggered batch** (Phase 14) — schedules generate visits.
- **Snow event-triggered batch** (Phase 15) — a storm declare fans out per-site dispatches.

All three converge on the **one** job model. Layered over them:
- **AI scope generation** (Phase 7) — drafts a technician scope for a job.
- **AI operations assistant** (Phase 16) — reads/triages across domains and drafts outbound updates.

Both AI surfaces share the `agent_*` runner substrate and the §2.5 draft-vs-act human gate.

## Complete table inventory — 115 tables, 42 migration files (0000–0041)

*(115 includes `__drizzle_migrations`. No migration added in Phase 16; next free is 0042.)*

| Domain | Representative tables |
|--------|----------------------|
| Tenancy & auth | `tenants`, `tenant_users`, `tenant_job_sequences`, `users`, `accounts`, `sessions`, `verifications`, `roles`, `user_roles` |
| Clients & locations | `clients`, `client_contacts`, `client_locations`, `client_location_access_notes`, `client_location_contacts`, `client_location_hours`, `client_users`, `client_billing_rules`, `client_nte_rules` |
| Vendors | `vendors`, `vendor_contacts`, `vendor_locations`, `vendor_users`, `vendor_service_areas`, `vendor_trade_coverage`, `vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores` |
| Jobs | `jobs`, `job_attachments`, `job_contacts`, `job_events`, `job_notes`, `job_statuses`, `job_status_history`, `job_priority_history`, `job_trade_history`, `priorities`, `trades` |
| Dispatch | `job_vendor_assignments`, `job_vendor_assignment_status_history`, `dispatch_assignment_statuses`, `dispatch_messages`, `vendor_check_ins`, `vendor_check_outs`, `vendor_eta_confirmations` |
| Communications | `communication_logs`, `outbound_messages`, `inbound_messages`, `email_templates`, `client_update_logs`, `vendor_update_logs`, `portal_update_queue` |
| AI / agents | `agent_runs`, `agent_tool_calls`, `agent_decisions`, `agent_policies`, `agent_policy_defaults`, `ai_prompt_templates`, `ai_prompt_template_defaults`, `update_rewrite_drafts`, `update_rewrite_reviews`, `scope_templates`, `scope_template_steps`, `job_scope_drafts`, `job_scope_reviews`, `job_scope_steps` |
| Billing | `client_invoices`, `client_invoice_line_items`, `vendor_invoices`, `vendor_invoice_line_items`, `proposals`, `proposal_approvals`, `proposal_line_items`, `change_orders`, `change_order_approvals`, `change_order_line_items`, `payment_records`, `job_billing_events` |
| Integrations (external) | `external_systems`, `external_accounts`, `external_credentials`, `external_client_mappings`, `external_location_mappings`, `external_priority_mappings`, `external_status_mappings`, `external_trade_mappings`, `external_work_order_links`, `external_payload_logs`, `external_sync_events`, `external_sync_runs` |
| Email ingestion | `email_ingestion_accounts`, `email_parser_rules`, `email_parse_results`, `email_attachments`, `email_work_order_drafts`, `inbound_emails` |
| Preventative maintenance | `pm_programs`, `pm_schedules`, `pm_schedule_locations`, `pm_visits`, `pm_visit_checklists`, `pm_visit_results`, `pm_generation_runs`, `pm_assets` |
| Snow operations | `snow_programs`, `snow_sites`, `snow_events`, `snow_event_sites`, `snow_dispatches`, `snow_service_logs`, `snow_service_triggers`, `snow_weather_observations` |
| Audit | `audit_logs` |

## Roadmap §9 empirical correction (record so §9 does not mislead)

Roadmap §9 ("AI Scope / AI Logging") named AI-logging tables that were **never built** and were
**superseded by the live design**:

- **`ai_action_logs`** → AI actions log via the **`agent_*`** substrate
  (`agent_runs`/`agent_tool_calls`/`agent_decisions`, Phase 6, inherited 7/8/13/16). Decision F16-B.
- **`ai_generated_updates`** → AI drafts land in **`update_rewrite_drafts`** (Phase 6), the §2.5
  review-gated draft table. Decision F16-C.
- **`ai_scope_generation_logs`** → Phase-7 scope generation logs to `agent_*` (+ `job_scope_drafts`).

The only live `ai_*` tables are `ai_prompt_templates` + `ai_prompt_template_defaults` (prompt
config). Future work should treat the §9 names as historical, not as a build target.

## Post-MVP backlog

The canonical list is **`closeout-carryforwards.md`** (Phase-16-new items + the full inherited
bank rolled forward verbatim). Do not re-derive it elsewhere.

## Recommended post-roadmap directions (highest value first)

1. **Operator-portal UI** — the largest accumulated bank: the chat UI (B-16.3), mass-op/dispatch
   surfaces (B-14.4, B-15.3), and PM/snow program CRUD + dashboards (B-14.1/.3, CF-14.3, B-15.4).
   The engines are built and harness-protected; they need surfaces.
2. **LLM draft phrasing** (B-16.5) — flip the assistant's deterministic drafts to LLM prose via
   the already-wired provider seam + a prompt template. Low-risk, high-visibility.
3. **Live email receiver + parser** (CF-13.2/.3) — turn the email-ingestion substrate live.
4. **PM/snow live triggers** (B-14.2, B-15.2) — the cron/weather feeds that auto-fire the engines.
5. **Credential encryption-at-rest** (CF-12.4) — security hardening for external integrations.

## Status

The roadmap (Phase 0 → 16) is **COMPLETE at `v2.0.0-phase-16`**, pending the gated close
(push / tag / merge) handled separately after this closeout review. Phase 16 added zero tables
and zero migrations; the platform is one cohesive, multi-tenant, source-agnostic, AI-assisted
work-order system with every meaningful workflow audited.
