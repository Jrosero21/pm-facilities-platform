# Phase 29 — Chatbot Knowledge

## What Phase 29 added
The **unattended-trigger mechanism** for autonomous re-dispatch. Before Phase 29 a human had to click
a button for the system to autonomously re-dispatch a stuck job. Phase 29 makes that same engine
callable by something that is not a person — a token-guarded HTTP endpoint — plus the extra guardrail
an unattended caller needs (a per-job cooldown).

## How the trigger works (plain answer)
1. Something calls `POST /api/cron/auto-redispatch` with a secret token.
2. The system finds tenants that have the dispatch agent switched on.
3. For each, it lists **genuinely stuck** dispatches — sent to a vendor who has not accepted within
   that job's priority threshold (2 h emergency → 24 h routine).
4. Any job already auto-re-dispatched in the last **4 hours** is skipped (cooldown).
5. For the rest it re-checks every permission gate and either re-dispatches to the next best vendor,
   or prepares a draft and **holds it for operator review**.
6. It returns a summary: how many swept, auto-sent, held, skipped, and why.

## Is autonomous re-dispatch running automatically right now?
**No.** The mechanism is built and proven, but **no schedule is wired**. Nothing fires on a timer.
Today it runs when an operator clicks the sweep button on `/notifications`, or when someone calls the
endpoint by hand. This was deliberate — there are no live clients yet, so a timer would only fire at
test data.

## What bounds it
Two independent limits: a **count cap** of 3 total re-dispatch attempts per job (from Phase 28), and a
**4-hour cooldown** between autonomous actions on the same job (new in Phase 29). Plus the stuck
filter, spend ceilings, policy conditions, a quality bar, and per-client consent — every one of which
can only *hold* the action, never widen it.

## Is it safe to run?
Yes. Autonomy is off by default at every layer; with it off a sweep scans nothing and writes nothing.
The endpoint is disabled entirely unless `CRON_SECRET` is set — an unset secret fails closed.

## What is deferred
- The **automated schedule** — needs a live operation, plus Vercel Pro or an external scheduler
  (Vercel's Hobby tier only allows daily crons, too coarse for a 2-hour emergency threshold).
- The **must-notify-client send** — the obligation is recorded on the client record but no client
  notification is sent yet; it is gated on the schedule landing.
- The **policy-conditions authoring UI** — conditions are set by script, not in-app.

## Common question: "why build a trigger and not turn it on?"
Because the guardrails an unattended caller needs were proven *before* the timer existed, which is the
correct order. Turning it on is now a configuration decision, not a build.
