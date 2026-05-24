# PM Facilities Platform — Claude Code instructions

Read this file at the start of every session. Full product context lives in `docs/roadmap/01-gpt-project-roadmap.md` — read that before any non-trivial implementation work.

## Technical context

- Stack: Next.js / React, server-side DB access only (never browser → MySQL).
- DB: MySQL/MariaDB on Namecheap, accessed via SSH tunnel.
  - Tunnel: `ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com`
  - Host: 127.0.0.1:3307 · DB: jonnyrosero_pm · User: jonnyrosero_jonny
- Project root: `~/Desktop/PM` (fallback `~/Desktop/pm`).

## Session-safe MySQL pattern

Never put the password in shell history. Always use:

    cd ~/Desktop/PM 2>/dev/null || cd ~/Desktop/pm
    read -s MYSQL_PWD
    export MYSQL_PWD
    mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm -e "..."

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
- Before major phases, take a local rsync snapshot to `~/Desktop/PM_snapshot_v0_N_0_phase_N/` (exclude `node_modules`, `.next`, `.git`).

## Hard rules

- The app is source-agnostic. ServiceChannel is one channel among many — do not center the architecture on it.
- Do not build features from future phases without explicit reason (roadmap §5.4).
- Browser never connects directly to MySQL.
- AI output is always a reviewable draft, never final.
- A phase is not complete until all eleven docs exist under `docs/phase-N-<name>/`.

## Verification before closeout

Before claiming a phase done, run and report:

    git status
    ls docs/phase-N-*/
    # plus phase-specific verification queries against the live DB

## Closeout template

See roadmap §10. Every phase ends with `11-closeout.md` written from that template.