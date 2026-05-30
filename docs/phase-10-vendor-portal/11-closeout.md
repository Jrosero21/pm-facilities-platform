# Phase 10 — Closeout

**Phase:** 10 — Vendor Portal MVP · **Version:** `v1.1.0-phase-10` · **Branch:** `phase-10-vendor-portal` · **Roadmap:** §8

- **Construction HEAD (10n):** `fc63bca`
- **Closeout commit (10p):** _(this commit)_ — its hash is recorded in the `v1.1.0-phase-10` tag annotation, not self-referenced here (this doc ships **inside** the closeout commit).
- **Tag target:** the HEAD on `main` after fast-forward (linear history; no merge commit) — created in 10p-tag.

**Version-semantics note:** `v1.1.0` marks the **first external portal** (vendor users) atop the `v1.0.0` internal aggregator MVP. The Phase 11 client portal will be `v1.2.0` per the roadmap §11 version table.

## What Phase 10 delivered

The vendor portal MVP: a `vendor_users` identity linkage (migration `0025`), a `job_notes.origin` provenance column (migration `0026`), the `(vendor)` route group with `requireVendor`/`getVendorScope` auth substrate, four vendor URLs, six dual-writing dispatch transitions, vendor notes (author-scoped read filter + operator origin tag), photo placeholders (NULL-file_url metadata rows), vendor invoice submission (thin wrapper over Phase 8's `recordVendorInvoice`), and a 61-assertion regression harness. Write-heavy and human-gated; no agent. All 10 roadmap §8 deliverables discharged. See `01-phase-summary.md`.

## Commit ledger (`phase-10-vendor-portal`)

| Commit | Sub-batch | Description |
|---|---|---|
| `d6f6a58` | 10.0 | Opening handoff document |
| `6d17f6f` | 10a | Substrate inspection + design proposal (10 forks surfaced) |
| `cbfe002` | 10b | Forks locked + 3 Decisions-of-Record |
| `c448bcd` | 10d/10e | `vendor_users` linkage — migration `0025` (sandbox + prod) |
| `48fdf80` | 10g | Vendor predicates + `getVendorScope` + harness |
| `963b3b3` | 10i | `(vendor)` route group + `requireVendor` + role-routing |
| `1f3986a` | 10j | Assignment list reader + page + seed/harness |
| `dd0c54b` | 10k-actions | Six dispatch transitions + server actions |
| `3891b55` | 10k-ui | Detail page + per-status action UI |
| `91ee94c` | 10l-migration | `job_notes.origin` — migration `0026` (sandbox + prod) |
| `125ab50` | 10l-construct | Vendor notes write/read/UI + operator origin tag |
| `2c7b881` | 10m-construct | Photo placeholders |
| `fc63bca` | 10n-construct | Invoice submission |
| _(this commit)_ | 10p | Phase closeout — 12 docs |

Inspect-only sub-batches (10c, 10e, 10f, 10h, 10k-ui-inspect, 10l-inspect, 10l-construct-inspect, 10m-inspect, 10n-inspect, 10p-inspect) produced chat reports, not commits.

## Verification record (embedded in the tag annotation)

**Production schema @ close:**
- `SELECT COUNT(*) FROM __drizzle_migrations` → **27** (`0000`–`0026`).
- `vendor_users` table present (byte-for-byte sandbox ⇄ prod parity).
- `job_notes.origin` present (`varchar(16) NOT NULL DEFAULT 'operator'`); the 3 pre-existing prod notes backfilled to `operator`, 0 NULLs (DoR-10b.2).

**Code state:** `npx tsc --noEmit --skipLibCheck` → **0** · `npm run build` → **clean** (`/vendor/jobs`, `/vendor/jobs/[id]`, `/vendor/jobs/[id]/invoices/new`, `/vendor-no-access` all present; vendor pages **ƒ Dynamic**).

**Vendor regression:** `npm run db:check:vendor-predicates` (seeded sandbox) → **61/61 PASS**.

**Sandbox state:** seed tenant `phase9-seed-tenant` present with the Phase-10 fixture (vendor user + `vendor_users` mapping, 1 SENT assignment, 4 notes, 2 photo placeholders, 1 `vendor_portal` invoice).

**Hard-rule compliance (§1):** the only production writes in Phase 10 were the two approved migrations (`0025`, `0026`). Every other prod touch was a read-only `information_schema`/verification query; all seed/harness/development was sandbox-scoped (guarded). "Browser never connects to MySQL" + "no production writes from build/seed scripts" upheld. AI output remained a reviewable draft throughout (every sub-batch held at a gate).

## Carry-forwards

**Phase 10-originated:** 21 FBs (`FB-10a.1`–`.7`, `FB-10b.1`, `FB-10g.1`/`.2`, `FB-10i.1`, `FB-10j.1`/`.2`, `FB-10k.1`/`.3`/`.4`/`.5`, `FB-10l.2`/`.3`, `FB-10p.1`) — definitive entries in `closeout-carryforwards.md`. `FB-10g.2` was **discharged** at 10j.

**Inherited (still open / unchanged):** `CF-9d.6.1`, `CF-9e.4.1`, `CF-9f.1` (Phase 9); `CF-8b.1` (**extended** through `0026`), `CF-8c.8.3` (**partial** — vendor-predicates harness added). The other eight Phase-8 CFs are untouched and remain in Phase 8's ledger.

## `v1.1.0-phase-10` tag annotation (content)

```
v1.1.0-phase-10: Vendor Portal MVP — the platform's first external portal.

Closeout commit: <10p SHA>  ·  Construction HEAD: fc63bca
Sub-batches 10a–10n complete on phase-10-vendor-portal.

Verification:
- Prod __drizzle_migrations = 27 (0000–0026); vendor_users + job_notes.origin present.
- job_notes.origin: 3 pre-existing prod rows backfilled to 'operator', 0 NULLs (DoR-10b.2).
- tsc 0 / build clean (4 vendor routes; vendor pages Dynamic).
- Vendor harness: 61/61 PASS (seeded sandbox).
- Roadmap §8: 10/10 deliverables discharged.

Carry-forwards: 21 Phase-10 FBs (see closeout-carryforwards.md); FB-10g.2 discharged.
Inherited open: CF-9d.6.1, CF-9e.4.1, CF-9f.1; CF-8b.1 extended through 0026;
CF-8c.8.3 partial (vendor-predicates harness).

Closeout docs: docs/phase-10-vendor-portal/ (12 docs: 11 canonical + closeout-carryforwards.md),
alongside retained manifests (00-handoff, 10a-inspection-report, 10a-design-proposal, 10b-decisions-locked).
Convention: v1.1.0 marks the first external portal per roadmap §8/§11.
```

## Doc set

12 closeout docs (`01`–`11` + `closeout-carryforwards.md`) under `docs/phase-10-vendor-portal/`, alongside the **4 retained planning artifacts**: `00-phase-10-handoff.md`, `10a-inspection-report.md`, `10a-design-proposal.md`, `10b-decisions-locked.md` (the Phase-10 analogue of Phase 9's retained `9a`–`9g` docs). The 12 docs above are the authoritative phase record.

## Phase 11 cut

In 10p-tag: push `phase-10-vendor-portal` + tag, fast-forward `main` to the closeout commit, tag `v1.1.0-phase-10`, then cut `phase-11-client-portal` off `main` and write the Phase 11 opening handoff (the Phase 10 client-portal symmetry — `vendor_users` → `client_users`, the `(client)` group template — is the parting artifact).
