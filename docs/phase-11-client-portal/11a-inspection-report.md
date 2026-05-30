# 11a Inspection Report — Phase 11 Client Portal substrate

Read-only substrate survey for the Client Portal MVP (`v1.2.0-phase-11`). No schema/migration/seed/DB writes. Every load-bearing claim is sourced to a file path or a live query. Recommendations live in `11a-design-proposal.md`; this doc is empirical findings only.

The headline: Phase 11 is the **symmetric sibling of Phase 10** and lands on an unusually warm runway — the client substrate already exists, the job `source_type` and note `visibility`/`origin` already support clients, and Phase 8's proposal-approval + client-invoice layers are already built. The vendor portal is a working template for nearly every piece.

---

## §1 Branch & worktree state

| Check | Observed |
|---|---|
| Branch | `phase-11-client-portal` ✅ |
| HEAD | `633bb2c` (Phase 11 handoff) ✅ |
| Tree | clean ✅ |
| Tunnel | up ✅ |

`git log` top: `633bb2c Phase 11 (11.0): opening handoff` on `c85bef3` (Phase 10 closeout). No stop-trigger.

## §2 Schema source of truth

Drizzle schema at **`src/server/schema/`** (34 files, barrel `index.ts`). Latest migration on disk: **`0026_superb_catseye.sql`** (Phase 10's `job_notes.origin`). Next free number: **`0027`**. (Note: the older `src/db/schema/` path the templates sometimes assume does not exist — same as Phase 10.)

## §3 Client substrate (Phase 2 + Phase 8 — exists, do not modify)

All client tables present:
- **`clients`** (`clients.ts:14`) — `id varchar(36)` PK uuidv7, **`tenant_id varchar(36)` NOT NULL FK→tenants cascade**, `name` (NN), `clientCode` (nullable), `status` enum(active/inactive/archived), `createdByUserId` (SET NULL), timestamps. Indexed: `(tenant_id, name)` unique, `(tenant_id, clientCode)` unique, `(tenant_id)`, `(status)`. Leaner than `vendors` (no legalName/phone/website columns) but the same **tenant-scoped, uuidv7-PK** shape — the client↔user linkage mirrors `vendor_users` exactly. `client_locations` carries `client_id` + denormalized `tenant_id` (FK→clients cascade), full address + lat/lng.
- **`client_contacts`**, **`client_locations`** (`clients.ts`).
- **`client_location_contacts`**, **`client_location_hours`**, **`client_location_access_notes`**, **`client_billing_rules`**, **`client_nte_rules`** (`client-details.ts`).

So the client organization, its locations, and its billing rules are all modeled. The **only** missing client-side table is the user linkage (§4).

## §4 Client-user linkage — the gap (Fork 1)

- **`client_users` does NOT exist** — live `SHOW TABLES LIKE 'client_users'` returns empty; no `client_users`/`clientUsers` references in `src/` or `db/`.
- The **`client_user` role exists and is seeded** (since the Phase 1 role model — confirmed at 10a §3 alongside `vendor_user`).
- This is the exact symmetric gap `vendor_users` filled in Phase 10: a `client_user` is a role with no scope target until a linkage table maps the user → a `clients` row within a tenant.
- **Verdict:** Phase 11 Fork 1 is a new `client_users` table (the `vendor_users` twin). No stop-trigger (its absence is expected).

## §5 LOAD-BEARING — `jobs.source_type` (live)

```
source_type  enum('manual','internal_client_portal','external_client_portal',
                  'email_ingestion','forwarded_email','api',
                  'preventative_maintenance','snow_event')  NOT NULL DEFAULT 'manual'
```

**`internal_client_portal` IS a valid value.** The client work-order submission flow can set it with **no migration**. Roadmap §2.1 invariant holds. No stop-trigger.

## §6 LOAD-BEARING — `job_notes` visibility + origin (live)

```
visibility  enum('internal_only','vendor_visible','client_visible',
                'client_and_vendor_visible','requires_review')  NOT NULL DEFAULT 'internal_only'
origin      varchar(16)  NOT NULL DEFAULT 'operator'
```

- **`visibility` includes `client_visible` AND `client_and_vendor_visible`** ✅ — the client read filter has the values it needs.
- **`origin` is `varchar(16)`, NOT an enum** (the Phase 10 Fork-4 lock chose varchar precisely so future origins grow without a migration — `DoR-10m.1`/`DoR-10b.2`). Adding a `'client'` origin value is therefore an **application-level change with NO migration**. This directly resolves the Fork-5 question (`origin` enum → `0027`?): **no migration needed.**

## §7 Phase 8 substrate — proposals + client invoices

**`src/server/billing/proposals.ts`** (412 lines; AR-side quotes, lifecycle **draft → sent → viewed → accepted**; `proposal_approvals` audit trail):
- Writers: `createProposal`, `updateProposalDraft`, `addProposalLineItem`/`updateProposalLineItem`/`removeProposalLineItem`, `sendProposal`, **`recordProposalAcceptance`** (line 238), `withdrawProposal`, `createProposalRevision`.
- Readers: `getProposal`, `listProposalsForJob`, `listProposalLineItems`.
- **Finding (corrected):** there is **no `approveProposal`/`rejectProposal`** pair. The client-facing approval is **`recordProposalAcceptance`** — the existing writer the Fork-6 client flow wraps (the 10n pattern). **There is no client "reject" writer**: the lifecycle has the client *accept* (`recordProposalAcceptance`); declining is the operator's `withdrawProposal` / `createProposalRevision`. So Fork 6 is *approve-only* on the client side unless a new reject/decline path is authored — a real fork.

**`src/server/billing/client-invoices.ts`** (AR-side invoices):
- Writers (operator-side): `createClientInvoice`, line-item CRUD, `sendClientInvoice`, `voidClientInvoice`.
- Readers: `getClientInvoice`, `listClientInvoicesForJob`, `listClientInvoiceLineItems`, `sumApprovedClientInvoiceTotals`.
- **Finding:** client-invoice readers exist for the portal's **read-only** invoice visibility (Fork 7); the client portal writes nothing here. Likely surfaces only `status='sent'`+ invoices to the client (drafts are operator-internal).

## §8 Vendor substrate to mirror (Phase 10 — frozen template)

- **`getVendorScope(userId, tenantId): Promise<Set<string>>`** (`src/server/vendor-scope.ts`) — `SELECT vendor_id FROM vendor_users WHERE tenant_id=? AND user_id=?`. The `getClientScope` twin: `SELECT client_id FROM client_users WHERE …`.
- **`requireVendor(): Promise<VendorAuthContext>`** (`src/server/auth-context.ts`) — `requireTenant()` → `isVendorUser` → `getVendorScope` non-empty, else `/vendor-no-access`; returns `TenantAuthContext & { vendorScope }`. The `requireClient` twin returns `{ clientScope }`, redirecting to `/client-no-access`.
- **Predicates** (`src/server/role-predicates.ts`): `isVendorUser`, `canActOnAssignment`, `canSubmitVendorInvoice` compose over `hasAnyRole`. Twins: `isClientUser`, `canActOnClientJob`, …
- **Role-routing shim** lives in **`src/app/(app)/layout.tsx`** (post-`requireAuth`: vendor_user + non-empty scope + no operator role → `/vendor/jobs`). Extends to a client branch.
- **`(vendor)` route group** (`src/app/(vendor)/...`, URL-invisible; literal `vendor/` segment makes the URL) — the `(client)` group mirrors it.
- **Vendor server dir** (`src/server/vendor/`): `assignment-actions`, `create-vendor-note`, `create-vendor-photo-placeholder`, `get-vendor-assignment-detail`, `list-assigned-jobs`, `list-assignment-{notes,attachments,invoices}`, `submit-vendor-invoice` — the per-surface templates.

## §9 `createJob` — the submission target (Fork 4)

`createJob(input: CreateJobInput): Promise<JobRow>` (`src/server/jobs.ts:236`). `CreateJobInput` (line 208) = `{ tenantId, clientId, clientLocationId, problemDescription, primaryTradeId?, priorityId?, **sourceType?**, sourceExternalId?, scopeOfWork?, notToExceedAmount?, createdByUserId }`. **It accepts `sourceType`** → the client submission wraps it: `requireClient` → resolve client scope → `createJob({ sourceType:'internal_client_portal', clientId:<from scope>, clientLocationId, problemDescription, createdByUserId })`. The 7-step tx (counter→insert→status-history→`job.created` event→audit) runs unchanged; the job enters the aggregator workflow at status NEW. **Built-in safety:** `createJob` already throws `CLIENT_NOT_FOUND` / `LOCATION_NOT_FOUND` / `LOCATION_CLIENT_MISMATCH`, so the client wrapper's job is to **pin `clientId` from the user's scope** (never trust a form-supplied clientId) and pass a `clientLocationId` the writer then validates belongs to it. This is the genuinely-new write path (clients *originate* jobs, unlike vendors who act on existing assignments), but built on the existing Phase 4 writer.

## §10 Operator-side clients UI (do not duplicate)

`src/app/(app)/clients/`: `page.tsx` (list), `[id]/page.tsx` (detail), `[id]/locations/*` (location CRUD), `[id]/nte-rules/page.tsx`, `new/page.tsx`, + `actions.ts` / `contact-actions.ts` / `location-actions.ts`. The operator manages client orgs here; the **client portal is a separate `(client)` group**, client-scoped, and must not re-implement operator client-management.

## §11 Drift / surprises

1. **Warmer runway than Phase 10.** Phase 10 had to build the vendor org table understanding; Phase 11's client substrate (org + locations + billing rules) is fully built. Only `client_users` is new.
2. **`origin` is varchar, not enum** — adding `'client'` is migration-free (the Phase-10 varchar lock paying off exactly as `DoR-10m.1` intended).
3. **Phase 8 already built the AR approve/reject + client-invoice readers** — the client portal's proposal/invoice surfaces are read/wrap, not author.
4. **The new muscle is job *origination*** (client creates a job entering the aggregator workflow), not leaf-surface acting. This is the one place Phase 11 diverges from the vendor template and needs careful fork design (Fork 4) — scope resolution must pin `client_id` from the user's scope and validate `client_location_id` belongs to that client.
5. **No stop-trigger fired.** `client_users` absent (expected), `internal_client_portal` present, `client_visible` present.
