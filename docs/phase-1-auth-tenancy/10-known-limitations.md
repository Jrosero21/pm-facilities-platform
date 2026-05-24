# Phase 1 — Known Limitations

Things intentionally not built or only partially built in Phase 1. Each is safe to defer and noted for later phases.

## L-1.1 — No invitation flow / no public signup
Access is invite-only, but there is no UI (or API) to invite a user. The only way to add a user today is to extend the seed or run a one-off `tsx` script (see `04-admin-sop.md` SOP-1.F). A real invitation flow (token, accept page, `tenant_users.status = invited`) is a later deliverable.

## L-1.2 — Logout and failed logins are not audited
Only `auth.login`, `auth.user.created`, and `tenant.switched` are recorded. Sign-out has no clean DB hook in the current better-auth setup, and failed logins don't produce a DB change to hook. Both can be added via request-level hooks later.

## L-1.3 — No email verification
`emailAndPassword` is enabled without verification (no email service wired). `users.email_verified` exists but stays `false`. Enable verification once an email provider is integrated.

## L-1.4 — No password reset / change
No "forgot password" or self-service password change. Locked-out users need admin intervention.

## L-1.5 — No tenant-switcher UI
`setActiveTenant()` exists and is validated + audited, but nothing in the UI calls it. Multi-tenant users are pinned to their first active membership until a switcher is built.

## L-1.6 — better-auth IDs are not UUID v7
Tables we own use UUID v7 PKs; better-auth generates its own 32-char IDs for `users`/`sessions`/`accounts`/`verifications`. Both fit `varchar(36)`, but those IDs aren't time-sortable. Changing this requires a better-auth ID-generator override and would be a breaking data change — leave as-is unless there's a concrete need. This is the trade-off side of the UUID v7 decision; see `02-decisions.md` D-1.3.

## L-1.7 — MySQL engine must be forced on every migration
Namecheap MariaDB defaults to MyISAM (no FK support). `scripts/fix-mysql-engine.mjs` rewrites generated migrations to `ENGINE=InnoDB` and runs as part of `pnpm db:generate`. Hand-authored migrations must be passed through it before `db:migrate`. The first run created `__drizzle_migrations` as MyISAM; it was converted to InnoDB manually.

## L-1.8 — No route-level middleware
Protection is per-route via the server guard (validates the live session — more secure, but runs on each request). There is no `middleware.ts` doing an early cookie-presence check. A lightweight middleware optimization can be added later; it must not replace the server-side validation.

## L-1.9 — No rate limiting / brute-force protection on auth
The sign-in endpoint has no throttling beyond better-auth defaults. Add rate limiting before any public exposure.

## L-1.10 — No CI
No GitHub Actions or other CI. Build/lint/typecheck are run manually (`pnpm build`, `pnpm lint`). CI is a carry-forward from Phase 0.

## L-1.11 — Setup-time audit rows present
End-to-end testing produced real `audit_logs` rows (e.g. a curl-based `auth.login`). They are genuine, append-only records and were left in place rather than deleted.

## L-1.12 — Global-role uniqueness not enforced at the database level
The `user_roles` unique index is on (`user_id`, `role_id`, `tenant_id`). MySQL treats `NULL` as distinct in unique indexes, so multiple rows with the same (`user_id`, `role_id`) and `tenant_id = NULL` are permitted — i.e. a user could be granted the same *global* role (e.g. `super_admin`) more than once. Tenant-scoped grants (non-null `tenant_id`) are correctly de-duplicated by the index. Global-role uniqueness is only guarded in app/seed code (the seed checks for an existing global grant before inserting). A durable fix would need a generated sentinel column (e.g. coalescing `NULL` to a fixed value) or an app-level constraint. See `07-chatbot-knowledge.md` K-1.12.

## L-1.13 — Adding a user is a manual script
There is no UI or API to create or invite a user (see L-1.1). The only path today is to extend `db/seeds/initial.ts` or run a one-off `tsx` script that calls `auth.api.signUpEmail` and then inserts the `tenant_users` and `user_roles` rows (see `04-admin-sop.md` SOP-1.F). This is a deliberate stopgap until the invitation flow exists: it requires repo access plus the seed env vars, is easy to get wrong (forgetting the membership or role grant), and must not become the long-term mechanism for onboarding users.
