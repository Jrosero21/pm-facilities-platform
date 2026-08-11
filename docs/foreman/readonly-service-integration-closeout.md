# PM -> FOREMAN Read-Only Service Integration Closeout

## Status

**VERIFIED**

The PM facilities platform can now read a real work order, translate the
platform-specific snapshot into FOREMAN's canonical WorkOrderContext,
call the independently deployed FOREMAN service, validate the returned
CoordinatorDecision, and return that decision without mutating PM data.

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

Implementation checkpoint:

`b8a5ad8 Connect PM read-only work orders to deployed FOREMAN`

The integration branch has intentionally not been pushed to GitHub yet.

## Cloud Preview Constraint

The PM Vercel Preview environment was inspected before pushing the branch.

It currently does not contain the normal PM application configuration,
including `DATABASE_URL`.

Therefore the integration branch should not be pushed merely to trigger a
Preview deployment.

Copying the PM production database and production application secrets into a
general Preview environment would weaken the isolation model.

## Next Recommended Checkpoint

Create an isolated PM Preview/test environment before cloud integration
testing.

Preferred characteristics:

- disposable or test database
- or a database credential restricted to read-only access for the required
  FOREMAN snapshot queries
- Preview-only PM application configuration
- branch-specific FOREMAN service credentials
- no production mutation credentials unless independently required and safe

Only after that environment exists should `foreman-readonly-integration` be
pushed and tested through a Vercel Preview deployment.
