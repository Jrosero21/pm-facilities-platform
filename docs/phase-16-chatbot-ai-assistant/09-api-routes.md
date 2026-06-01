# Phase 16 — API Routes

## No new HTTP routes this phase.

Phase 16 is the **service layer only** (decision F16-D): the `chatbot_assistant_v1` agent, its
10 tools, draft-landing, logging, and the phase-blocking harness. It exposes its functionality as
server-side functions, not HTTP endpoints:

- `runChatbotAssistant(...)` — `src/server/agents/chatbot-assistant/index.ts`
- the 10 tools (bound through the runner) — `tools.ts` / `operational-tools.ts` / `draft-tools.ts`
- `searchKnowledge` / `readDoc` — `knowledge.ts` (guarded by `doc-access.ts`)

## Deferred (banked B-16.3)

The **chat UI** and any route/Server-Action surface that drives the assistant from the operator
portal are deferred to the operator-portal phase — mirroring the B-14.4 (PM) / B-15.3 (snow)
engine-then-portal split. When that surface lands it will:
- call `runChatbotAssistant` from a Server Action / route handler under the existing auth-context
  guard (`requireTenant`), threading `activeTenant.tenantId` into the run,
- stream tool results to a chat component (likely via the `ai` SDK),
- and route draft review/publish through the **existing** human-gated actions
  (`createReview` / `publishRewriteDraft`) — not through the agent.

No route work was performed in Phase 16.
