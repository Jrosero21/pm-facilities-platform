# Phase 1 — System Workflows

How the auth and tenancy machinery actually flows at runtime.

## WF-1.1 — Login
```
User submits email+password on /login (client component)
        ↓
authClient.signIn.email() → POST /api/auth/sign-in/email
        ↓
better-auth verifies credentials against accounts.password (hashed)
        ↓
better-auth creates a sessions row + sets the session cookie
        ↓
databaseHooks.session.create.after → writeAuditLog("auth.login", ip, ua)
        ↓
client redirects to /dashboard
```

## WF-1.2 — Request authorization (the guard)
```
Request hits a protected route (e.g. /dashboard under the (app) layout)
        ↓
(app)/layout.tsx calls requireAuth()
        ↓
getAuthContext():
  - auth.api.getSession({ headers })           → session or null
  - if null → redirect("/login")
  - load tenant_users ⨝ tenants                → memberships[]
  - load user_roles ⨝ roles                    → role rows (global + per-tenant)
  - resolve active tenant: pm_active_tenant cookie if valid,
      else first active membership
  - effective roleKeys = global grants + grants in active tenant
  - isSuperAdmin = has super_admin with tenant_id NULL
        ↓
page calls requireTenant() / requireRole(...) as needed
        ↓
render with the typed AuthContext
```

## WF-1.3 — Role check
```
requireRole("operator", "accounting")
        ↓
requireAuth() first (redirects if no session)
        ↓
if isSuperAdmin → allow
else if any effective roleKey ∈ allowed → allow
else → redirect("/forbidden")
```

## WF-1.4 — Tenant resolution & switching
```
Active tenant = valid pm_active_tenant cookie ∩ memberships
             else first membership with status "active"
             else null → requireTenant() redirects to /no-tenant

setActiveTenant(tenantId):
  - requireAuth()
  - verify tenantId ∈ memberships (reject otherwise)
  - set pm_active_tenant cookie (httpOnly, lax, secure in prod)
  - writeAuditLog("tenant.switched")
```
(The server mechanism exists; no UI switcher in Phase 1.)

## WF-1.5 — Logout
```
SignOutButton (client) → authClient.signOut()
        ↓
better-auth deletes the session + clears the cookie
        ↓
client redirects to /login; subsequent protected requests redirect to /login
```
(Logout is not yet audited — see `10-known-limitations.md` L-1.2.)

## WF-1.6 — Audit write
```
writeAuditLog(input) → INSERT into audit_logs
  - append-only; never updates
  - failures are caught and logged, never thrown (auditing must not break the flow)
Events wired in Phase 1: auth.login, auth.user.created, tenant.switched
```
