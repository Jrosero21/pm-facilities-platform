# Phase 11 — System Workflows

End-to-end flows through the client portal, naming the modules and the guards at each hop. All three write paths share the same shape: **`requireClient` → thin action (identity from ctx) → server wrapper (scope-guard) → Phase-4/8 writer (unchanged)**.

## A. Authentication & routing
```
sign-in → session
  → (app)/layout: if isClientUser(ctx) && !canSeeOperations(ctx):
        getClientScope > 0 ? redirect /client/jobs : redirect /client-no-access
  → (client)/layout: requireClient()
        - not client_user        → redirect /client-no-access
        - client_user, empty scope → redirect /client-no-access
        - else → ClientAuthContext { ...tenant, clientScope }
```
`/client-no-access` is a top-level page (outside both groups) to avoid recursive guard redirects.

## B. Work-order origination (the WRITE crux — SI-11f.1)
```
/client/jobs/new (page)
  → listClientsInScope + listClientScopedLocations   (scope-filtered options)
  → NewJobForm (client component; client picker only when scope>1; client-side location filter)
  → createClientJobAction (use server)
        - requireClient(); identity ALL from ctx
        - clientId: scope size 1 → pin sole member (ignore form); >1 → form selection
        - parse clientLocationId, problemDescription
  → createClientJob (server wrapper)
        I1  clientScope.has(clientId)            else CLIENT_SCOPE_MISMATCH
        I3  getLocation → location.clientId === clientId && in scope   else throw
        → createJob({ clientId pinned, sourceType:'internal_client_portal',
                      primaryTradeId:null, priorityId:null, NTE omitted, createdBy:ctx.user })
  → createJob (Phase 4, unchanged): ONE txn — counter lock, insert @ NEW,
        job_status_history (null→NEW), job.created event, audit_logs.
        LOCATION_CLIENT_MISMATCH is the 2nd gate. Throw before/in txn → zero rows.
  → redirect /client/jobs/{id}
```
The job is now in the operator queue at NEW, unclassified, source-tagged.

## C. Reading a job (SI-11d.1)
```
/client/jobs        → listClientJobs(tenant, scope)         inArray(jobs.clientId, scope) + !archived
/client/jobs/[id]   → getClientJobDetail(tenant, id, scope) getJobDetail then clientScope.has(clientId) else null → notFound()
   notes            → listClientJobNotes(tenant, id, scope) re-guard via getClientJobDetail, then
                        visibility ∈ {client_visible, client_and_vendor_visible}
                        OR (origin='client' AND author ∈ client_users-scope)
```
`getClientJobDetail` is the single isolation truth — the detail page, note reader, note writer, and proposal reader all route their scope check through it.

## D. Client update / note (SI-11g.1)
```
ClientNoteForm → createClientNoteAction(jobId,…) → createClientNote
   → getClientJobDetail(tenant, jobId, scope)  else CLIENT_SCOPE_MISMATCH (zero rows)
   → createJobNote({ origin:'client', visibility:'client_visible', createdBy:ctx.user })
   → revalidatePath(/client/jobs/{jobId})  → the note appears via the origin='client' branch
```

## E. Proposal accept (SI-11i.1)
```
ProposalAccept → acceptProposalAction(jobId, proposalId,…) → acceptClientProposal
   → getProposal(tenant, proposalId)            else CLIENT_SCOPE_MISMATCH
   → getClientJobDetail(tenant, proposal.jobId, scope)  else CLIENT_SCOPE_MISMATCH (proposal stays 'sent')
   → recordProposalAcceptance(decision='accepted', approverUserId=ctx.user)  [Phase 8, unchanged, txn]
   → revalidatePath(/client/jobs/{jobId})
```
`recordProposalAcceptance` trusts its caller for authz (no role/scope check) — so the wrapper's scope-guard is the **sole** authorization gate. It requires `status='sent'`; otherwise `ProposalNotSent` (mapped to friendly copy by `.name`).

## F. Billing reads (OQ-6)
```
/client/invoices → listClientInvoicesForClientScope(tenant, scope)
                     inArray(clientId, scope) + status='sent'; join jobs for jobNumber;
                     SELECTs total only — never subtotal/markup_total/line items.
job detail        → listClientJobProposals(tenant, jobId, scope)
                     scope-guard via getClientJobDetail; status='sent'; total only.
```

## Source-agnostic invariant exercised
A client-portal job is indistinguishable downstream from any other `jobs` row except by `source_type`. The dispatch/billing/analytics machinery reasons about the job, not the channel — the platform stays source-agnostic (hard rule).
