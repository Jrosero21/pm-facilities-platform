# Phase 0 — Known Limitations

Phase 0 is foundation-only. The "limitations" below are intentional — they describe everything the project explicitly does **not** do yet — so future phases don't mistake absence for a defect.

## L-0.1 — No application code
`src/` exists but is empty. There is nothing to run, build, deploy, or test. No `package.json`, no Next.js install, no lint/format tooling.

## L-0.2 — No database schema
The live database is empty of project tables. No migrations have been authored, no seeds loaded.

## L-0.3 — No auth, no users, no tenants
No identity layer exists. There is no concept of a logged-in user or a tenant context. (Phase 1.)

## L-0.4 — No CI, no deployment, no environments
No GitHub Actions, no Vercel link, no `.env` convention, no preview/prod separation. (To be addressed alongside Phase 1.)

## L-0.5 — No secrets management
The MySQL password is supplied per-session via `MYSQL_PWD`. There is no `.env`, no secret manager, no `.env.example`. (To be addressed alongside Phase 1.)

## L-0.6 — Roadmap PDF is also in repo root
`Pm Facilities Platform Roadmap.pdf` lives at the repo root. The canonical roadmap is the markdown file at `docs/roadmap/01-gpt-project-roadmap.md`; the PDF is a duplicate kept for convenience and may drift. Carry-forward decision: keep or remove in Phase 1.

## L-0.7 — `.DS_Store` is tracked in working tree
macOS metadata is present in the working tree. Confirm `.gitignore` excludes `.DS_Store` before Phase 1 begins; remove any tracked copies if present.

## L-0.8 — No automated verification
Phase 0 verification is manual (run the commands in `11-closeout.md`). No script bundles them yet.

## What is **not** a limitation
- The absence of business features (clients, vendors, jobs, dispatch, billing, portals, AI, integrations). Those are scheduled in Phases 1–16 and are correctly out of scope here.
