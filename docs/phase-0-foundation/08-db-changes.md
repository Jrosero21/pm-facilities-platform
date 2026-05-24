# Phase 0 — Database Changes

## Status
**N/A for Phase 0.**

No tables, columns, indexes, views, or seed data were created. The live database `jonnyrosero_pm` is untouched by this phase.

## What Phase 0 did establish
The **locations** future DB work will land in:

- `db/migrations/` — created, empty. Phase 1+ migrations land here.
- `db/seeds/` — created, empty. Phase 1+ seeds land here.

## Connection reference (for verification only)
Live DB is reached through an SSH tunnel:

```
ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com
```

Then:

- Host: `127.0.0.1:3307`
- DB: `jonnyrosero_pm`
- User: `jonnyrosero_jonny`

Password is supplied via `MYSQL_PWD` env var per the pattern in `CLAUDE.md`. Never inline a password.

## Verification
```bash
ls db/migrations/   # expect: empty
ls db/seeds/        # expect: empty
```

## Forward pointers
- Phase 1: first migrations — `tenants`, `users`, `roles`, `tenant_users`, `user_roles`, optionally `audit_logs`.
