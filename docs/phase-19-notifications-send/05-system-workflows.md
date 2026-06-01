# Phase 19 — System Workflows

## Workflow 19.A — Compose → send → flip → audit (the live send backend)

```
compose (existing):
  publishRewriteDraft / shareNote → INSERT communication_logs (delivery_status='draft',
                                     source_type+source_id → the content row, recipient_email)
                     │
operator clicks Send → sendCommunicationAction(jobId, commId) [requireTenant]
                     │
sendCommunication({ tenantId, commId, actorUserId }):
  1. getCommunication → COMMUNICATION_NOT_FOUND
  2. IDEMPOTENCY (§2.6): delivery_status==='sent' OR provider_message_id!=null → return early (NO send)
  3. isLegalDeliveryTransition(current, 'sent')                                → INVALID_DELIVERY_TRANSITION
  4. recipient_email present                                                   → MISSING_RECIPIENT
  5. resolveSendContent(tenantId, comm):
        client_update   → client_update_logs.content (subject derived from job #)
        outbound_message → outbound_messages.subject + body
        else            → UNRESOLVABLE_SEND_SOURCE   (never sends the summary excerpt)
  6. provider = getSendProvider()     // capture-by-default; ResendProvider only with a key
     result  = provider.send({ to, subject, body, commId })
  7a. sent   → UPDATE delivery_status='sent', sent_at=now(), provider_message_id, attempts++
              + audit 'communication.sent'  { from, to:'sent', jobId, provider }
  7b. failed → UPDATE delivery_status='failed', last_error, attempts++
              + audit 'communication.failed' { from, to:'failed', jobId, provider, error }
```
The pure flip (`updateCommunicationDeliveryStatus`) stays for non-send transitions (delivered/bounced/
queued/failed-as-correction). Only the **Send** button routes through the provider.

## Workflow 19.B — Exception detection feed

```
/notifications (Server Component, requireTenant, PULL)
        │
getExceptions(tenantId):
   ├─ listVendorNotAccepted   → job_vendor_assignments JOIN dispatch_assignment_statuses(code='SENT')
   │                            JOIN jobs JOIN clients JOIN vendors ; ageSeconds = NOW()-sent_at
   ├─ listNteIncreaseRequested→ change_orders(status='submitted') JOIN jobs JOIN clients
   └─ operationalQueue(tenantId) FILTERED to isOverdue||isStalled||isUnassignedHighPriority
                                 (pure 'aged' excluded)
        │
   union (discriminated on `kind`) → sortKey = elapsed seconds (one scale) → sort DESC
        │
   ExceptionQueue (display-only) → one row per kind, #job · client link + age + detail
```
Detection only — no action is taken. Re-dispatch / approve happen on the job detail page.

## Workflow 19.C — Capture-by-default (no accidental send)

```
no RESEND_API_KEY (default) OR SEND_CAPTURE=1
        → getSendProvider() = CaptureProvider (records payload, returns cap_<commId>_<n>, sends nothing)
RESEND_API_KEY set AND SEND_CAPTURE!=1
        → getSendProvider() = ResendProvider (fetch api.resend.com, Idempotency-Key=commId)
```
The harness forces capture; production enables real email only when the key is deployed.
