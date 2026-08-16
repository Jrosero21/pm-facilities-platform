# PM Facilities Platform — Claude Code instructions

Read this file at the start of every session. Full product context lives in `docs/roadmap/01-gpt-project-roadmap.md` — read that before any non-trivial implementation work.

## Technical context

- Stack: Next.js / React, server-side DB access only (never browser → DB).
- DB: **PostgreSQL** (migrated from MariaDB; the MariaDB/Namecheap/SSH-tunnel era is over — no tunnel, no `mysql` client).
  - Local dev: `postgres://…@localhost:5432/pm` · sandbox `…/pm_sandbox` (harnesses derive `pm` → `pm_sandbox`).
  - Production: **Neon** (`neondb`), Vercel-hosted app. Prod URL is `DATABASE_URL_NEON` in `.env.local`.
  - Driver `pg` (node-postgres) via Drizzle `dialect: "postgresql"` (`drizzle.config.ts`).
- Project root: `~/projects/PM`.

## Session-safe Postgres pattern

Never put credentials in shell history — read the URL from `.env.local`, never retype it:

    cd ~/projects/PM
    # local dev / sandbox
    psql "$(grep -m1 -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" -c "..."
    # scripts (server-only imports need the react-server condition)
    pnpm tsx --env-file=.env.local --conditions=react-server scripts/<name>.ts

Migrations: generate with `pnpm db:generate`; apply as direct DDL (sandbox → verify → prod).
**Never run `drizzle-kit migrate` against prod** — the `__drizzle_migrations` ledger undercounts and a
replay produces duplicate-column errors. The schema is ahead of the ledger by design.

## Working discipline

1. Identify the active phase before doing anything. If unclear, ask.
2. Source-of-truth order: user instruction → roadmap → live repo → live DB → current phase docs → older phase docs.
3. Inspect before editing. Do not rewrite without reading.
4. Small batches: inspect → propose → apply → verify → summarize, then continue.
5. Stay inside the current phase. Flag scope creep explicitly.
6. Every meaningful workflow gets a history/event row, not just a state overwrite.

## Git conventions

- Branch per phase: `phase-N-<short-name>` (e.g. `phase-4-jobs`).
- Tag per closeout: `v0.N.0-phase-N`.
- Before major phases, take a local rsync snapshot to `~/projects/PM_snapshot_v0_N_0_phase_N/` (exclude `node_modules`, `.next`, `.git`).

## Hard rules

- The app is source-agnostic. ServiceChannel is one channel among many — do not center the architecture on it.
- Do not build features from future phases without explicit reason (roadmap §5.4).
- Browser never connects directly to the database.
- AI output is always a reviewable draft, never final.
- A phase is not complete until all eleven docs exist under `docs/phase-N-<name>/`.

## Verification before closeout

Before claiming a phase done, run and report:

    git status
    ls docs/phase-N-*/
    # plus phase-specific verification queries against the live DB

## Closeout template

See roadmap §10. Every phase ends with `11-closeout.md` written from that template.