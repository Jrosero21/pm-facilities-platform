# Phase 29 — Admin SOP

## Setting `CRON_SECRET`
The route is **disabled until this is set** — the guard fails closed, so an unset secret is a safe
state, not an open one.

```bash
# generate
openssl rand -hex 32
```
Store it in `.env.local` for local work, and in the deployed project's environment for the
deployment. **Never** paste it into shell history or a commit; read it from the environment.

Rotating it is a straight replace — the route holds no state and no session.

## Enabling autonomy — the gate stack (all default OFF)
The trigger **adds no permission**. It decides only which tenants to scan. Enabling actual autonomous
action means opening each of these deliberately:

| Layer | Where | Default |
|---|---|---|
| **Kill switch** | `tenant_autonomy_settings.kill_switch` | off (blocks everything) |
| **Policy `autonomyEnabled`** | `agent_policies.policy` (`dispatch_router_v1`) | off |
| **Policy conditions** | amount / trade / priority / client block | — set via `set-agent-conditions-policy.ts` (no UI, CF-28.1) |
| **Token + spend ceilings** | `max_llm_tokens_per_day`, `max_committed_per_job` | enforced; fail **closed** on unmeasurable NTE |
| **Quality bar** | per-agent confidence | enforced |
| **Per-client consent** | `clients.autonomy_allowed` | **false** — opt-in per client |

Turning on the tenant policy alone changes nothing for a client who has not consented. That
composition is intentional: the tenant grants *capability*, the client grants *permission*.

## Enabling the automated schedule (NOT done in this phase)
Deliberately deferred — see `10-known-limitations.md`. When there is a live operation:

1. **Choose a scheduler.** Vercel Hobby caps crons at **once per day**, too coarse for a 2-hour
   EMERGENCY threshold. Use **Vercel Pro** (`vercel.json` crons, e.g. `*/15`) or an external
   scheduler that can `POST` with the Bearer header.
2. **Set `CRON_SECRET` in the deployed environment** — without it the route stays inert.
3. **Add the schedule.** For Vercel that is a `crons` entry pointing at
   `/api/cron/auto-redispatch`. **No route change is needed** — path and header format already match
   what Vercel Cron sends.
4. **Turn autonomy on for one low-stakes client first** and read `perTenant` summaries before widening.

## Safety posture
- **Fail closed everywhere:** unset secret → disabled; unmeasurable NTE → spend check blocks;
  autonomy unset → off.
- **Bounded twice:** count cap (3 total per job) *and* rate cooldown (4h per job). See
  `06-business-rules.md`.
- **Sequential by design** — do not "optimise" the sweep into `Promise.all`; the spend ceiling depends
  on serialization (D-29.4).
- **Fully audited:** every autonomous action writes an `agent_runs` / `agent_decisions` row plus the
  normal assignment history, under the system actor.
- **One failure never aborts a run:** a per-job throw is tallied and the sweep continues; a per-tenant
  throw is tallied and the next tenant proceeds.

## Emergency stop
Flip `tenant_autonomy_settings.kill_switch`. It is checked inside T1 per job, so it takes effect on
the next job considered — no deploy, no route change. Unsetting `CRON_SECRET` additionally makes the
entrypoint itself inert.
