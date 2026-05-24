# Phase 1 — User SOP

Standard operating procedures for an end user (an internal aggregator user) in Phase 1. The surface is intentionally small: sign in, view the dashboard, sign out.

## SOP-1.1 — Sign in
1. Go to the app root (`/`) and click **Sign in**, or go directly to `/login`.
2. Enter your email and password.
3. On success you are redirected to `/dashboard`.
4. On failure an inline error appears; re-enter your credentials.

Notes:
- Accounts are created by an administrator (invite-only). There is no self-serve signup in Phase 1.
- There is no "forgot password" flow yet; contact an administrator if you are locked out.

## SOP-1.2 — Read the dashboard
The dashboard shows your current context:
- **User** — your name and email.
- **Active tenant** — the tenant you are acting in, and its type (aggregator/vendor/client).
- **Roles** — your effective role keys in the active tenant (plus any global roles).
- **Memberships** — how many tenants you belong to.

The header bar shows the app name, the active-tenant badge, your email, and a **Sign out** button.

## SOP-1.3 — Sign out
1. Click **Sign out** in the header.
2. You are returned to `/login` and your session is cleared.
3. Visiting a protected page (e.g. `/dashboard`) afterward redirects you back to `/login`.

## What is not available to users yet
- Switching between tenants from the UI (the mechanism exists server-side; no button yet).
- Changing your own profile, email, or password.
- Any client, vendor, job, dispatch, billing, or reporting screens (later phases).
