# PM -> FOREMAN Read-Only Service Integration Closeout

## Status

**VERIFIED — LOCAL, ISOLATED NEON, AND CLOUD PREVIEW**

The PM facilities platform can read a real work order, translate the
platform-specific snapshot into FOREMAN's canonical WorkOrderContext,
call the independently deployed FOREMAN service, validate the returned
CoordinatorDecision, and return that decision without mutating PM data.

The complete cloud path has also been verified from an isolated PM Vercel
Preview through a Neon read-only compute endpoint to the standalone
production FOREMAN service.
## Isolation

Integration development was performed in the isolated Git worktree:

`/Users/jonnyrosero/projects/PM-foreman-integration`

Branch:

`foreman-readonly-integration`

The active PM development worktree remained separate.

## FOREMAN Service

The PM integration calls the independently deployed standalone FOREMAN
service.

Stable service URL:

`https://foreman-gamma-five.vercel.app`

Coordinator endpoint:

`POST /api/v1/coordinator/evaluate`

The PM service client always constructs:

`mode: DRY_RUN`

The PM client exposes no caller-controlled SANDBOX or LIVE mode option.

It also rejects a successful response if the returned decision mode is not
DRY_RUN.

## Integration Flow

The verified path is:

PM database
-> getForemanWorkOrderSnapshot()
-> ForemanPmSnapshot
-> mapForemanPmSnapshotToWorkOrderContext()
-> canonical WorkOrderContext
-> deployed FOREMAN v1 API
-> validated CoordinatorDecision
-> read-only PM HTTP response

FOREMAN does not import or depend on the PM platform's internal schema.

## PM Endpoint

Read-only decision endpoint:

`GET /api/integrations/foreman/work-orders/[jobId]/decision`

The endpoint requires the existing dedicated FOREMAN read bearer token.

No authenticated token:

- HTTP 401

Valid read token:

- reads the PM work-order snapshot
- maps the snapshot to WorkOrderContext
- calls deployed FOREMAN
- returns the CoordinatorDecision

## Verification

### Contract Harness

Result:

**PM -> FOREMAN SERVICE CONTRACT: PASS**

Verified:

- PM snapshot maps to canonical WorkOrderContext
- service request is forced to DRY_RUN
- service response is schema validated
- weak service token is rejected
- invalid service response is rejected

### TypeScript

`pnpm exec tsc --noEmit`

Result:

**PASS**

### Targeted ESLint

The new FOREMAN integration files were linted directly.

Result:

**PASS**

The repository-wide lint command still reports unrelated pre-existing errors
in `scripts/check-job-photos.ts`. Those files were not modified as part of
this integration.

### Production Build

`pnpm build`

Result:

**PASS**

The generated Next.js route table included:

`/api/integrations/foreman/work-orders/[jobId]/decision`

## Real PM Work Order Test

Real PM work-order ID:

`019f33a9-7e6c-76cf-977c-ae1c9db13d74`

The integration was first exercised directly through the route handler.

Result:

**REAL PM -> DEPLOYED FOREMAN: PASS**

Returned decision:

- mode: `DRY_RUN`
- stage: `READY_TO_DISPATCH`
- recommended action: `RECOMMEND_VENDOR`
- urgency: `HIGH`
- confidence: `HIGH`
- human attention required: `true`

## Real HTTP Test

The PM integration branch was then run through a local Next.js production
server and tested through the actual HTTP endpoint.

Unauthenticated request:

- HTTP 401
- authentication gate: PASS

Authenticated request:

- HTTP 200
- PM database snapshot: PASS
- canonical mapping: PASS
- remote FOREMAN evaluation: PASS
- decision validation: PASS

Overall result:

**REAL HTTP PM -> DEPLOYED FOREMAN: PASS**

Returned decision:

- mode: `DRY_RUN`
- stage: `READY_TO_DISPATCH`
- action: `RECOMMEND_VENDOR`
- urgency: `HIGH`
- confidence: `HIGH`
- human attention required: `true`

FOREMAN reported that the work order has an approved scope and currently has
no vendor assigned, so a qualified vendor should be recommended.

The next-check condition is to re-evaluate after an operator selects a vendor
or the vendor-assignment state changes.

## Safety State

This integration does not authorize:

- PM database writes
- PM work-order status changes
- vendor assignment
- vendor dispatch
- vendor communications
- client communications
- SANDBOX execution
- LIVE FOREMAN execution

This remains a read/evaluate/return integration only.

## Git State

Primary integration branch:

`foreman-readonly-integration`

Verified implementation checkpoints:

- `ed11a8c Add read-only FOREMAN work order snapshot endpoint`
- `b8a5ad8 Connect PM read-only work orders to deployed FOREMAN`
- `56b79d2 Document verified PM to FOREMAN integration`

The primary integration branch is published to GitHub and tracks:

`origin/foreman-readonly-integration`

A separate disposable deployment branch was created only for the cloud
Preview proof:

`foreman-preview-deployment`

Preview-only checkpoints:

- `7be6a3c Disable cron for isolated FOREMAN preview`
- `bddd438 Trigger isolated FOREMAN preview deployment`

Those two Preview-only commits are intentionally not part of
`foreman-readonly-integration`.

## Isolated Neon Read-Only Verification

A child Neon branch was created specifically for Preview integration testing:

`foreman-readonly-preview`

Neon project:

`polished-grass-71950476`

Database:

`neondb`

The test connection used a Neon read-only compute endpoint.

Database-level verification:

- `SHOW transaction_read_only` returned `on`
- an attempted write was rejected by the database
- no PM production mutation credential was used for the Preview test

Real Neon work-order ID:

`019f3427-f9bb-7091-8b88-e8654e3d7427`

Job number:

`3`

Problem:

`Loose handrail on the back stairwell and a sticking stockroom door that will not latch. Needs a handyman to secure the rail and adjust the door during business hours.`

## Real-Data Rule-Gap Feedback Loop

The first isolated Neon replay exposed a deterministic FOREMAN rule gap.

Observed state:

- vendor dispatched
- vendor not acknowledged
- no vendor acknowledgement follow-up deadline configured

Before the rule improvement, FOREMAN derived the correct stage and escalated,
but used the generic unsupported-state fallback with `LOW` confidence.

FOREMAN was intentionally not given an invented acknowledgement timing rule.

The standalone FOREMAN service was then updated with a deterministic rule
that treats the missing acknowledgement follow-up deadline as an explicit
missing policy fact.

FOREMAN checkpoint:

`205a9c7 Handle missing vendor acknowledgement deadline`

The same real Neon work order was replayed against the updated deployed
service.

Result:

**REAL PM -> DEPLOYED FOREMAN: PASS**

Updated decision:

- mode: `DRY_RUN`
- stage: `AWAITING_VENDOR_ACKNOWLEDGEMENT`
- action: `ESCALATE_TO_OPERATOR`
- urgency: `NORMAL`
- confidence: `HIGH`
- human attention required: `true`

Situation:

`The vendor has been dispatched and has not acknowledged the work order, but no vendor acknowledgement follow-up deadline is configured.`

Reason:

`FOREMAN cannot safely determine when vendor follow-up is due because no vendor acknowledgement follow-up deadline is configured. An operator must supply or confirm the missing timing policy.`

Next check:

`Re-evaluate after an operator configures or confirms the vendor acknowledgement follow-up deadline.`

This verified the intended feedback loop:

real operational data
-> canonical mapping
-> deployed coordinator
-> rule gap discovered
-> deterministic rule and regression coverage
-> production redeployment
-> same real job replayed
-> improved explicit decision

## Cloud Preview Deployment

The normal PM repository contains a Vercel cron schedule:

`*/15 * * * *`

for:

`/api/cron/auto-redispatch`

The linked Vercel Hobby account rejects that schedule during Preview
deployment validation.

The real integration branch was not altered to work around that unrelated
deployment constraint. Instead, `foreman-preview-deployment` was created from
the integration branch with only the cron entry removed from `vercel.json`.

That deployment-only change must not be merged back into the active PM
development branch as part of the FOREMAN integration.

The deploy-only branch was configured with only the integration values needed
for the proof:

- `DATABASE_URL`
- `FOREMAN_TENANT_ID`
- `FOREMAN_READ_TOKEN`
- `FOREMAN_SERVICE_URL`
- `FOREMAN_API_TOKEN`

Isolation properties:

- `DATABASE_URL` points to the Neon read-only Preview compute endpoint
- `FOREMAN_READ_TOKEN` is Preview-only
- `FOREMAN_SERVICE_URL` points to the standalone production FOREMAN alias
- the PM client still forces `DRY_RUN`
- the PM production database URL was not copied into the Preview
- no PM production mutation path was authorized
- secret values were not committed to Git

Fresh Preview deployment:

`https://pm-facilities-platform-rfhdulutu-jonnys-projects-329eab11.vercel.app`

Deployment ID:

`dpl_HYwxbgBrLnwfrvHP3KvEUX8DzuZM`

Deployment status:

**READY**

## Cloud-to-Cloud Verification

The actual deplloyed PM Preview endpoint was tested through Vercel Deployment
Protection using the Vercel CLI.

Read-only decision endpoint:

`GET /api/integrations/foreman/work-orders/[jobId]/decision`

Real Neon work-order ID:

`019f3427-f9bb-7091-8b88-e8654e3d7427`

Unauthenticated request:

- HTTP 401
- response: `unauthorized`
- PM integration authentication gate: PASS

Authenticated request:

- HTTP 200
- PM Preview authentication: PASS
- real Neon work-order read: PASS
- canonical mapping: PASS
- deployed FOREMAN call: PASS
- returned mode: `DRY_RUN`

Returned decision:

- stage: `AWAITING_VENDOR_ACKNOWLEDGEMENT`
- action: `ESCALATE_TO_OPERATOR`
- urgency: `NORMAL`
- confidence: `HIGH`
- human attention required: `true`

Overall result:

**CLOUD PM PREVIEW -> DEPLOYED FOREMAN: PASS**

This proves the cloud path:

Vercel PM Preview
-> Preview-only PM bearer authentication
-> Neon read-only compute
-> real PM work order
-> canonical WorkOrderContext
-> standalone production FOREMAN
-> `DRY_RUN` CoordinatorDecision

## Current Conclusion

The read-only PM -> FOREMAN integration is now verified at three levels:

1. local PM application -> deployed FOREMAN
2. isolated Neon real-data replay -> deployed FOREMAN
3. deployed PM Vercel Preview -> Neon read-only compute -> deployed FOREMAN

FOREMAN remains a separately deployed coordinator behind a canonical,
system-independent boundary. The PM adapter remains read-only, and FOREMAN
has no authority in this integration to mutate PM production state.

The next architecture work should build on this verified boundary rather than
coupling FOREMAN directly to PM internals.
