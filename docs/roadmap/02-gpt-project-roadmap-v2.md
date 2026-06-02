# PM Facilities Platform — GPT Project Roadmap v2: The Road to Aggregator Autonomy
Purpose of This Document
This is the source-of-truth roadmap for version 2 of the PM Facilities Work Order Platform, covering Phases 17 and beyond. It is a sibling to 01-gpt-project-roadmap.md, not a replacement. The v1 roadmap remains the historical source-of-truth for Phases 0–16; this document opens at Phase 17.
v1 (Phases 0–16) is complete at tag v2.0.0-phase-16 (commit ea5b613): a multi-tenant facilities platform with 115 tables, three operating surfaces (reactive jobs, time-triggered PM batch, event-triggered snow batch), two AI surfaces (Phase 7 scope generation, Phase 16 read/draft assistant), operator/vendor/client portals, an external-integration framework, and email ingestion.
v2's single goal: move the aggregator from human-coordinated operations toward aggregator autonomy — the platform deciding and acting within tenant-defined bounds, with humans managing by exception rather than touching every job.
This document inherits all v1 invariants and working rules (see §2 of the v1 roadmap). They are not restated here; they still apply. v2 adds new invariants in §2 below.
 
## 1. What v2 Is — The Narrative
v2 is one arc with a dependency spine, not a feature list:
Extend the operator portal (the instrument)
        ↓
Notification center + exception queue (the nervous system — "manage by exception")
        ↓
Complete the vendor edge: photo storage, vendor-updates inbox, linkless magic-link access
        ↓   (the vendor portal is the autonomy OUTPUT surface AND the performance-DATA source)
Dispatch engine: eligibility floor → deterministic routing → rule-based auto-dispatch (no AI)
        ↓
Autonomy policy engine (extend the binary gate into per-agent on/off) + guardrails
        ↓
Agent observability + multi-provider failover (the readiness EVIDENCE that makes autonomy safe)
        ↓
Feedback loop (harvest operator corrections → few-shot)
        ↓
New agents (invoice → proposal → NTE negotiator) + AI-assisted dispatch (data-blocked)
        ↓
Auto-response escalation + policy-conditions expansion (the destination: bounded self-operation)
Two halves of autonomy. The aggregator must both decide what to do (agents, policies, feedback) and get the vendor to act (the vendor edge). An aggregator that decides perfectly but cannot close the vendor loop unattended has automated only the easy half. The vendor portal — especially linkless access — is the autonomy output surface, not a side feature.
Three tiers of dispatch autonomy, cheapest-and-safest first. Most autonomy value needs no AI:
1.    Deterministic routing — preferred-vendor-per-location assignment. A rules lookup. Handles the "I gave this vendor all 500 stores in the radius" case.
2.    Rule-based eligibility auto-dispatch — filter eligible vendors (trade/coverage/compliance/not-blocklisted) and pick by rule. Still no AI judgment.
3.    AI-assisted dispatch — only the cases rules cannot resolve. Deterministic scoring + LLM as semantic-fit tiebreaker, never free-chooser. Smallest, hardest, data-blocked.
The dispatch tier is itself a per-tenant policy. One tenant leans on location assignments (deterministic-heavy); another has no preferred-vendor deals and wants AI to pick every time; a third wants AI only above a confidence bar. The engine offers all three tiers as capabilities; each tenant configures the strategy over them.
 
## 2. New v2 Invariants (in addition to all v1 invariants)
These are non-negotiable and must survive every v2 phase.
2.1 Autonomy Is Always Opt-In and Fail-Safe-Gated
The default for every (tenant, agent) with no matching policy is gated/requires-review. This is already the live behavior of the policy resolver (fail-safe to requiresReview: true). No agent ever auto-acts because of a missing rule or an evaluation bug. Silence defaults to the human.
2.2 Autonomy Is Never Silent
Every autonomous action still writes the agent_* provenance chain and surfaces in an audit/spot-review surface. Autonomy shifts the operator from gatekeeper-on-every-item to auditor-of-a-sample — it does not remove review, it changes review from mandatory-before to inspectable-after on trusted paths.
2.3 Permission ≠ Readiness (Tenant Discretion With a Warning)
A tenant may enable autonomy on an agent without the agent having cleared an accuracy bar — this is tenant discretion. But the UI must warn clearly, and because permission is not readiness-gated, the audit/spot-review surface and agent observability are the safety net. The observability surface (Phase 23) is what turns "discretion with a warning" into "discretion with evidence."
2.4 Non-Overridable Guardrails
A spend circuit-breaker (per-job, per-day, per-tenant ceilings on both committed dollars and LLM cost) and a kill switch (one control to revert all autonomy to gated immediately) sit above any tenant policy. No policy can override them. If a trigger misfires and tries to spawn 400 dispatches past a spend ceiling, autonomy halts.
2.5 Hard Eligibility Rules Are a Floor AI Cannot Override
Any AI dispatch/decision operates only over a candidate set already filtered by hard rules (trade match, geographic coverage, current compliance, not-blocklisted). The AI never sees ineligible vendors; it cannot dispatch to an uninsured or out-of-area vendor because they were never candidates.
2.6 Idempotency on Every Autonomous Write
Every autonomous action carries a "did I already do this?" guard (the snow status-guarded link-back, made systematic). An agent that retries, or two triggers firing close together, must not double-dispatch, double-send a vendor link, or double-create an invoice.
2.7 Manage By Exception
The v2 MVP of autonomy is: auto-do the easy/routine work; flag exceptions to a human (vendor not accepted, NTE-increase requested, no same-day on-site confirmation, low-confidence draft, spend-ceiling hit). The first cut is detection + surface, not auto-response. Auto-response (re-dispatch to vendor B) is a late phase.
 
## 3. Source-of-Truth Order (unchanged from v1)
1.    Current user instruction and active phase
2.    This v2 roadmap (and the v1 roadmap for historical phases)
3.    Live repo files
4.    Live database schema
5.    Current phase docs
6.    Older phase docs (historical context only)
Live behavior wins over prose. Inspect before assuming. (See the v2 17a inspection report, docs/roadmap/v2-17a-inspection-report.md, for the live-state findings this roadmap is firmed against.)
 
## 4. Key Findings From the 17a Inspection (What Shaped This Plan)
The v2 phase plan is shorter than first sketched because the live state is more built than assumed:
•    Operator portal is NOT greenfield. A live operator UI consumes all 14 analytics readers behind permission gates, with full CRUD trees for clients/vendors/jobs. v2 extends it with review/audit surfaces; it does not build it from scratch.
•    Vendor portal is WIRED end-to-end. Accept/decline, confirm ETA/schedule, on-site, complete, invoice submit, and vendor notes all function. What remains: photo file-storage backend (currently a metadata placeholder) and the operator vendor-updates inbox. The "make the vendor portal functional" phase mostly evaporates; the real vendor phase is the linkless magic-link layer.
•    Autonomy bones exist as a binary gate. agent_policies + agent_policy_defaults exist with a live resolver that fail-safes to requiresReview: true. The policy models only {requiresReview: boolean} today. The plumbing and the safe default are built; the autonomy semantics (auto-execute, on/off enablement, thresholds, dispatch-tier-as-policy) are net-new modeling on that resolver.
•    Routing/scoring is data-blocked. No preferred-vendor concept exists anywhere; vendor_performance_scores, vendor_rates, and vendor_compliance are empty. AI-assisted dispatch cannot be good until the vendor portal has generated performance history — it is late by necessity, not just priority.
•    Notifications need a real send provider. communication_logs, the queue, and templates exist, but no live send backend (no email/SMS provider) is wired — "Send" is a manual status flip. The notification center's net-new part is the send backend, not the data model.
Baseline: 115 tables, latest migration 0041, next free 0042.
 
## 5. Phase Roadmap Overview

| Version | Phase | Main Goal |
|---------|-------|-----------|
| v2.0.0 | 16 | (v1 close — Chatbot & AI assistant) |
| — | 17 | v2 inspection & foundation sweep (complete) |
| v2.1.0 | 18 | Operator portal review/audit surfaces (extend existing portal) |
| v2.2.0 | 19 | Notification center + exception queue (+ live send backend) |
| v2.3.0 | 20 | Vendor edge completion: photo storage + vendor-updates inbox |
| v2.4.0 | 21 | Linkless magic-link vendor access + outbound delivery |
| v2.5.0 | 22 | Dispatch engine: eligibility + deterministic routing + rule-based auto-dispatch (Tiers 1–2) |
| v2.6.0 | 23 | Autonomy policy engine (per-agent on/off MVP) + guardrail layer |
| v2.7.0 | 24 | Agent observability + multi-provider/failover |
| v2.8.0 | 25 | Feedback loop (harvest corrections → few-shot) |
| v2.9.0 | 26+ | New agents (invoice → proposal → NTE negotiator) |
| v2.10.0 | 27 | AI-assisted dispatch (Tier 3, data-blocked on Phase 20) |
| v3.0.0 | 28+ | Auto-response escalation + policy-conditions expansion |

Phase count is not fixed — phases may merge or split as each phase's own inspection sub-batch reveals live state. The dependency spine (§1) is the real content; reorder freely only within what the dependency arrows allow.
 
## 6. Detailed Phase Plan
### Phase 17 — v2 Inspection & Foundation Sweep (complete)
**Goal:** Audit live Phase 9/10/11/15 surfaces + the agent_policies substrate + dispatch/eligibility data before committing the v2 plan. Output: docs/roadmap/v2-17a-inspection-report.md + this roadmap. No build.
 
### Phase 18 — Operator Portal Review/Audit Surfaces
**Version:** v2.1.0-phase-18 Goal: Extend the existing operator portal with the review/audit surfaces autonomy depends on. Deliverables:
•    AI-draft review queue (the §2.5-v1 gate gets its UI: review/edit/approve/reject update_rewrite_drafts).
•    Vendor-update review surface / operator vendor-updates inbox (retires FB-10a.3, FB-10l.2/3).
•    The dual-mode review concept: "awaiting approval" and "acted autonomously — inspect/undo" (groundwork for §2.2). Acceptance: Operator can review and act on AI drafts and vendor updates through the portal. Note visibility-promotion (requires_review → client-visible) is operator-gated. Do not build: notifications (Phase 19), autonomy enablement (Phase 23). Dependency: Phase 17. The portal largely exists — this is surfaces, not a shell.
 
### Phase 19 — Notification Center + Exception Queue + Live Send Backend
**Version:** v2.2.0-phase-19 Goal: The nervous system of "manage by exception" (§2.7). Push surface for exceptions + the first real outbound send provider. Deliverables:
•    Notification center: push surface for exceptions (vendor not accepted, NTE-increase requested, no same-day on-site confirmation), low-confidence drafts, spend-ceiling hits, autonomy events.
•    Exception queue: the operator's "things that need a human" list, fed by the existing operationalQueue / stalled / SLA-risk readers.
•    Live send backend — a real email/SMS provider wired into the Phase-6 outbound_messages substrate (the net-new part; the data model exists). Touches CF-12.x. SLA/escalation clocks must use client_location_hours + timezones (the clock-correctness invariant). Acceptance: Exceptions surface to the right operator promptly; a real message can be sent (not just status-flipped); the SLA clock respects business hours. Do not build: auto-response to exceptions (Phase 28); autonomy policy (Phase 23). Dependency: Phase 18. Load-bearing for every autonomy phase after it.
 
### Phase 20 — Vendor Edge Completion: Photo Storage + Vendor-Updates Inbox
**Version:** v2.3.0-phase-20 Goal: Close the gaps the 17a sweep found in the otherwise-wired vendor portal. Deliverables:
•    Photo/attachment physical storage backend (object storage; the metadata placeholder gets real bytes). Retires FB-10a.4 (the real photo-upload backend). NOT CF-13.4 — that is the email_attachments backend, untouched by Phase 20 and still open.
•    Vendor-update capture-then-review flow hardened (§2.3-v1): vendor updates land in the aggregator first, do not auto-become client-visible. Acceptance: A vendor can upload before/after photos that persist; vendor updates are captured and reviewable, not auto-client-visible. Do not build: linkless access (Phase 21); vendor performance scoring (later — fed by this phase's data). Dependency: Phase 18/19. Smaller than first planned — the portal is already wired.
 
### Phase 21 — Linkless Magic-Link Vendor Access + Outbound Delivery
**Version:** v2.4.0-phase-21 Goal: The autonomy-edge unlock — let unregistered vendors update a work order via a link, no account. Tens of thousands of vendors will not sign up immediately; linkless access captures the data from job one. Deliverables:
•    Tokenized magic-link access: a signed token bound to one job_vendor_assignment, opening that assignment's update surface (accept/decline, confirm ETA, on-site, complete, notes, photos). The highest-risk security surface in v2.
•    Token hardening: expiring, single-assignment-scoped (cannot enumerate to another job), revocable (operator kills the link), tamper-evident. Its harness carries explicit negatives: expired token rejected, foreign-assignment token rejected, revoked token rejected, tampered token rejected — mirroring the Phase-16 readDoc path-guard discipline.
•    Linkless-vendor attribution: updates attribute to the (assignment, token), not a user row (the identity-without-account fork).
•    Outbound link delivery via the Phase-19 send backend; builds a vendor-direction outbound send path (partially unblocks B-16.3's publish side). Does NOT retire B-16.3 — its operator chat UI and rewrite-draft vendor-publish path both remain unbuilt. Acceptance: An unregistered vendor can update exactly their one assignment via link; the token cannot reach any other job/tenant; revoked/expired/forged tokens are rejected; the link can be auto-sent on dispatch (the channel an autonomous dispatch acts through). Do not build: AI dispatch (Phase 27); full vendor registration funnel. Dependency: Phase 20. Its own phase because the token security surface deserves dedicated focus — the heaviest harness in v2.
 
### Phase 22 — Dispatch Engine: Eligibility + Deterministic Routing + Rule-Based Auto-Dispatch (Tiers 1–2)
**Version:** v2.5.0-phase-22 Goal: The non-AI dispatch foundation — where the safe volume is. Deliverables:
•    Shared eligibility query (the candidate-set both rule-based and AI pickers consume): trade match, geographic coverage, current compliance (§2.5), not-blocklisted, capacity if tracked. Compliance check lives in the dispatch path.
•    Deterministic routing: preferred-vendor-per-location assignment (net-new — no preferred-vendor concept exists today). The "500 stores in the radius" case.
•    Rule-based eligibility auto-dispatch: pick the best eligible vendor by rule (within-Nmi / compliant-only / matching-trade / not-national). Acceptance: A job can route to a preferred vendor by location automatically (no AI); rule-based auto-dispatch picks an eligible vendor; ineligible vendors are never dispatched. Do not build: AI scoring/tiebreaker (Phase 27); the policy enablement layer (Phase 23 governs this). Dependency: Phase 17 eligibility data. Sequenced before the policy engine because you need something to govern; tight coupling — could flip with 23.
 
### Phase 23 — Autonomy Policy Engine (per-agent on/off MVP) + Guardrail Layer
**Version:** v2.6.0-phase-23 Goal: Extend the live binary {requiresReview} gate into a per-tenant, per-agent autonomy policy. MVP granularity: per-agent on/off, fail-safe default off (gated). The condition vocabulary (amount/trade/client/confidence) is a later phase. Deliverables:
•    Per-tenant, per-agent autonomy enablement (extends agent_policies semantics — the resolver and override table exist; the autonomy fields are net-new). Fail-safe-gated default (§2.1); tenant-discretion-with-warning (§2.3); conservative conflict resolution (any matching gate wins).
•    The dispatch tier as a per-tenant policy (§1): deterministic-heavy vs AI-heavy vs hybrid strategy selection.
•    Guardrail layer (non-overridable, §2.4): spend circuit-breaker (per-job/day/tenant on dollars AND LLM cost) + kill switch + per-tenant cost metering.
•    Idempotency guards on autonomous writes (§2.6). Acceptance: A tenant can flip an agent autonomous (on/off) with a clear warning; default stays gated; guardrails cannot be overridden by policy; the kill switch reverts all autonomy to gated immediately; every autonomous action is logged (§2.2). Do not build: condition vocabulary (Phase 28); confidence floors (need Phase 24 calibration first). Dependency: Phase 19 (events surface), Phase 22 (something to govern).
 
### Phase 24 — Agent Observability + Multi-Provider/Failover
**Version:** v2.7.0-phase-24 Goal: The read surface over agent_* that makes tenant-discretion safe (§2.3) — and the provider resilience autonomy requires. Deliverables:
•    Agent observability dashboard: approve-as-is rate per agent, failure points, volume, cost-per-agent — the readiness evidence a tenant uses to decide on autonomy. (One surface, three uses: readiness evidence, feedback source, cost tracking.)
•    Token-logging retention policy (the tool_input/tool_output longtext growth — a quiet cost).
•    Multi-LLM provider switching + failover chain on the Phase-7 llm-routing seam: add OpenAI/Gemini as gateway-routed providers; per-tenant/per-agent provider preference; failover so autonomy does not stall on one provider's outage. Acceptance: An operator/tenant can see an agent's accuracy + cost trend; a provider outage fails over gracefully; cost is attributable per tenant per agent. Dependency: Phase 23.
 
### Phase 25 — Feedback Loop (Harvest Corrections → Few-Shot)
**Version:** v2.8.0-phase-25 Goal: Turn the operator corrections you already record into agent accuracy. The cheapest rung first. Deliverables:
•    Harvest the labeled signal already stored: the diff between update_rewrite_drafts.draft_content and update_rewrite_reviews.edited_content is a correction pair (approve-as-is = positive, reject = negative, edit-then-approve = gold).
•    Few-shot injection: mine the best correction pairs into agent prompts (~10–20 pairs/agent meaningfully sharpens; you start few-shot precisely because data is scarce early).
•    Eval-harness scaffolding (banked to mature when data volume grows; fine-tuning banked as the last rung, only if volume/cost justify). Acceptance: An agent's prompt is enriched by harvested corrections; the few-shot path is measurable against held-out examples. Note: Trusted-operator set = implicit signal quality for now; the "feedback poison" concern (untrusted corrections) revisits when the operator pool grows. Dependency: Phase 24 (the data lens).
 
### Phase 26+ — New Agents (Invoice Creator → Proposal Generator → NTE Negotiator)
**Version:** v2.9.0-phase-26 (and successors) Goal: Expand the autonomy surface. Each new agent is also a new correction source feeding Phase 25. Deliverables (per agent, following the proven pattern): register in the agent registry → run through the shared runner → produce a draft → land at the §2.5-v1 gate → policy-able (Phase 23) → feedback-fed (Phase 25). Retires B-16.5 (LLM draft phrasing) per agent. Ordering: low-stakes/high-volume first (invoice creator — routine, lots of reps, fast safe feedback signal), then proposal generator, then NTE negotiator (highest-stakes/adversarial — gate longest, possibly forever). Dependency: Phase 23/24/25.
 
### Phase 27 — AI-Assisted Dispatch (Tier 3)
**Version:** v2.10.0-phase-27 Goal: The smart picker for the cases rules cannot resolve. Deliverables:
•    Deterministic scoring/ranking over the eligible set: vendor_performance_scores, proximity, vendor_rates, client/location history, current load (arithmetic, auditable, near-free).
•    LLM as semantic-fit tiebreaker + explainer on close calls (matching the job's free-text problem to vendor specialization beyond the coarse trade code) — never the primary chooser.
•    Graceful degradation: if the LLM/provider is down, the scoring function alone produces a defensible ranking (autonomy does not stall).
•    Output: a ranked recommendation with confidence + rationale; policy (Phase 23) decides auto-dispatch vs draft-for-review. Acceptance: AI dispatch produces an auditable ranked recommendation over eligible vendors; the LLM only adjusts close calls; the system still ranks when the LLM is unavailable. Data-blocked: Cannot be good until the vendor portal (Phase 20) has generated performance history. Late by necessity, not just priority — also requires B-16.4 (populate vendor_performance_scores). Dependency: Phase 20 (data) + 22 (eligibility) + 23 (policy).
 
### Phase 28+ — Auto-Response Escalation + Policy-Conditions Expansion
**Version:** v3.0.0-phase-28 (the v2 arc's completion / v3 boundary) Goal: The destination — the response layer beyond detection, and the richer policy vocabulary. Deliverables:
•    Auto-response escalation engine: auto-re-dispatch to vendor B on decline/ghost/timeout; the ranked fallback chain (where vendor_performance_scores orders the fallback).
•    Policy-conditions vocabulary on agent_policies: amount thresholds (NTE < $500), trade filters (all-handyman), client include/exclude (all-clients-except-Apple), confidence floors (≥95% — now meaningful because Phase 24 calibrated confidence).
•    Idempotency systematized across all autonomous paths (§2.6) — after dedicated snow-workflow review time.
•    Client-autonomy-consent flag (per-client "autonomy allowed / must-notify-client"; §the contractual-notification need). Acceptance: The aggregator can recover from a failed dispatch without a human; tenants compose rich autonomy conditions; autonomous actions remain idempotent and client-consent-aware. Dependency: Phases 22–27.
 
## 7. Versioning and Git Rules (unchanged from v1)
Phase-based branches and tags, linear history (git merge --ff-only, never merge commits). Branch phase-N-<name>; tag v2.X.0-phase-N. Phase 28 targets v3.0.0 as the v2-arc completion / v3 boundary. Each migration its own sandbox → verify → PROD-confirm → prod → commit cycle. Every push/tag/merge/prod-write is a one-action gate, explained plainly, every time. There is no standing auto-push preference.
 
## 8. Closeout Discipline (unchanged from v1)
A phase is not complete until: (1) the 11 standard docs + closeout-carryforwards.md exist under docs/phase-N-<name>/; (2) the phase-blocking harness (where the phase has a testable surface) is green from a fresh file-read run; (3) the tag + ff-merge + origin push are done (each gated). Use the §10 closeout template from the v1 roadmap.
 
## 9. Inherited Bank → v2 Disposition
The v1 closeout-carryforwards.md is the canonical post-MVP backlog. v2 phases retire much of it:
•    Retired by v2 phases: FB-10a.3 / FB-10l.2 / FB-10l.3 (Phase 18) · FB-10a.4 (Phase 20) · the live email send backend — the "Send is a manual status flip / no live send provider" gap (17a / §6), never a numbered CF item, NOT a CF-12.x item (Phase 19) · B-16.4 (Phase 27 data dependency) · B-16.5 (Phase 26 per agent) · the operator-portal-UI bank items B-14.1/14.3/14.4/B-15.3/CF-14.3 (Phases 18/22/28 as the surfaces land).
•    Still banked beyond v2 (or revisited within it): CF-12.1–12.5 (the ServiceChannel external-platform track — full-workflow auto-push, live external HTTP adapter, operator mapping UIs, credential encryption-at-rest, external-ingest orphan window — untouched by v2) · CF-13.1/13.2/13.3/13.4/13.5 (email autonomy + live receiver/parser — a separate going-live track) · B-14.2 / B-15.2 (PM/snow live triggers — the live-trigger track) · CF-16.1 (source_type intent-tag) · CF-16.2 (invoice aging) · CF-16.3 (source_id polymorphic-meaning doc) · CF-14.2 (authz wrapper on approve fns) · FB-10b.1 (tenants.type enum hygiene) · FB-10p.1 (seed rename) · CF-19.1 (business-hours SLA clock) · CF-19.2 (Twilio SMS adapter) · CF-19.3 (no-same-day-on-site detection).
Each phase's closeout-carryforwards.md rolls the still-open bank forward verbatim, as in v1.
 
## 10. Project Alignment Reminder
v2 is not "add AI everywhere." It is the disciplined extension of a working platform toward bounded self-operation: deterministic routing where rules suffice, AI only where judgment is genuinely required, every autonomous action opt-in, logged, guardrailed, and reversible. The aggregator should move from coordinating every job by hand to managing the exceptions while the routine runs itself — safely, auditably, within tenant-defined bounds.
