# Phase 0 — API Routes & Server Actions

## Status
**N/A for Phase 0.**

No API routes, server actions, route handlers, middleware, or RPC endpoints were created. The `src/` tree exists as empty scaffolding only.

## What Phase 0 did establish
The **directories** future server code will land in:

```
src/
  app/          # Next.js App Router routes (Phase 1+)
  components/   # React components (Phase 1+)
  lib/          # shared utilities (Phase 1+)
  server/       # server-only modules; all DB access lives here
  types/        # shared TypeScript types
```

## Architectural rule reinforced here
All database access lives under `src/server/`. Client components reach the DB only through server actions or route handlers — never directly. (See `02-decisions.md` D-0.3.)

## Verification
```bash
ls src/   # expect: app components lib server types (all empty)
```

## Forward pointers
- Phase 1: `/login`, `/logout`, protected app shell route, tenant-aware server-side data access pattern.
