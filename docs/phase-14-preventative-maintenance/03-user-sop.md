# Phase 14 — User SOP (operator-facing)

How preventative-maintenance programs produce recurring work. **Note:** most operator UI is deferred to the operator-portal phase (B-14.1/B-14.3/B-14.4, CF-14.2/CF-14.3); this SOP describes the WORKFLOW the data/engine layer supports today (exercised by the harness, not yet screens). Program/schedule/membership are created via the data layer (seed/harness today; CRUD UI later).

## The model
1. **A PM program** is a recurring maintenance definition for one client: a name, a trade, a priority, and a program-level **scope of work** (the template — e.g. "Quarterly HVAC filter replacement"). It carries an **auto-generate** flag.
2. **A schedule** sets the recurrence: a frequency (day/week/month) × an interval count (every N). E.g. month × 3 = quarterly. It tracks **next due** and **last generated**.
3. **Schedule locations** are the **explicit subset** of the client's locations the program covers (e.g. Apple stores 1, 5, 20, 23 — NOT necessarily all of them).
4. When a schedule comes **due**, it **fans out** over its member locations → one **visit** per location → (auto programs) one **job** per visit at status NEW.

## Auto vs review programs
- **Auto** (`auto_generate=true`, the default): a due schedule spawns jobs immediately — deterministic, no gate.
- **Review** (`auto_generate=false`): a due schedule lands **pending-review visits**; an operator runs **batch-approve** to turn them into jobs. (This is the §2.5 human gate.)

## What batch-approve does
For a generation run's pending-review visits: each becomes a job (status NEW, `source_type='preventative_maintenance'`), attributed to the **approving operator**. A re-run is safe — already-approved visits report as `alreadyResolved`, none double-spawn.

## What an operator should know
- **Per-item isolation:** if one location can't generate (e.g. a bad location reference), only that visit is **skipped + flagged** with a reason; the rest of the batch still generates.
- **Idempotent recurrence:** once a schedule fires, its next-due advances by the interval — a re-scan won't double-generate the same occurrence.
- **The resulting jobs are ordinary jobs** — they flow into dispatch/billing like any other, carrying the program's trade/priority/scope.

## Not yet available (deferred)
PM-program/schedule CRUD screens (CF-14.3), the review-queue + batch-approve UI (CF-14.2), mass-dispatch/mass-update (B-14.4), the live scheduler that fires due schedules on a timer (B-14.2), and per-visit checklist result capture (CF-14.1).
