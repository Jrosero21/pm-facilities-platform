# Phase 16 — System Workflows

## 1. The assistant run lifecycle (shared runner)

Every assistant turn flows through the frozen shared runner
(`src/server/agents/runner.ts`), exactly as the rewriter and scope generator do:

```
runChatbotAssistant({ tenantId, … })
  openRun(agentId='chatbot_assistant_v1', jobId=null)   → agent_runs row (status 'running')
    bindTools(ctx)                                       → 10 tools, each wrapped by registerTool
      <tool call>                                        → agent_tool_calls row (kind read|write, status ok|error)
      …                                                  (one row per call, in sequence)
  closeRun(status='succeeded'|'failed')                  → agent_runs updated (terminal status, provenance)
```

- `agent_runs.job_id` is **NULL** — the assistant is a non-job agent.
- Tenant scope: operational + draft tools capture `ctx.tenantId` in a closure at bind time; the
  caller passes only the entity id. Drafts also capture `ctx.runId` for `agent_run_id`.
- Read tools log `tool_kind='read'`; the two draft tools log `tool_kind='write'`. Nothing else.

## 2. Knowledge retrieval + citation

```
searchKnowledge(query)
  listKnowledgeDocs()                  → glob docs/**/07-chatbot-knowledge.md (16 files)
  for each: resolveDocPath(rel)        → guard (docs/ .md only) → safe abs path
            readFileSync + substring match (case-insensitive)
  → matches[] each with { sourcePath, excerpt, line }   ← citable

readDoc(relPath)
  resolveDocPath(relPath)              → throws DOC_PATH_FORBIDDEN on traversal/absolute/non-.md
  readFileSync                          → { path, content }
```

Knowledge is **platform-level** (shared product docs) — these tools take no `tenantId`.

## 3. The draft chain — create (agent) → review (human) → publish (human)

```
[AGENT]   draftClientUpdate(jobId) / draftVendorFollowUp(jobId)
            getJobDetail + isJobStalled (tenant-scoped)
            compose deterministic prose
            createRewriteDraft({ …, agentRunId, sourceType, sourceId=jobId })
            → update_rewrite_drafts row, status='pending_review'   ← STOPS HERE
--------------------------------- §2.5 human gate ---------------------------------
[HUMAN]   createReview(draftId, decision)   → pending_review → approved | rejected
[HUMAN]   publishRewriteDraft(draftId, actorUserId)
            → client_update_logs + communication_logs (delivery_status='draft')
            → draft status → published
[HUMAN]   send via the existing 6e delivery flow   (Publish ≠ Send)
```

The agent module imports **none** of `createReview` / `publishRewriteDraft` / client-updates /
communication writers — the gate is structural, not conventional. Confirmed by harness group C
(zero review/publish/comm rows; status stays `pending_review`).

## 4. Tenant isolation (cross-tenant poison)

Every operational/draft tool calls a reader filtered by the bound `tenantId`. A tool bound to
tenant-A, given a real tenant-B id, gets `null`/empty → returns "not found" and creates nothing.
Verified by harness group E against a real seeded tenant-B.
