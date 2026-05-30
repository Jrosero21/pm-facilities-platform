# Phase 11 — Client User SOP

For the external **client user** (role `client_user`, mapped to one or more client orgs via `client_users`). Seed account: `client@phase9seed.test` (sandbox).

## Signing in & what you land on
1. Sign in. If your account has client access in the active tenant, you are routed to **`/client/jobs`**. If you have no client mapping (empty scope) you see **"Client portal not available"** — contact your administrator.
2. The portal nav shows: **Jobs · Locations · Invoices**, plus a chip with how many client orgs you can see.

## Submit a work order
1. Go to **Jobs → New work order** (`/client/jobs/new`).
2. If you are mapped to more than one client org, pick the **Client**; with one org it is pinned automatically.
3. Pick a **Location** (filtered to the chosen client's locations).
4. Describe the problem in **What's the problem?** and submit.
5. You land on the new work order's detail page. The aggregator's team triages it from there (priority, trade, and any not-to-exceed amount are set by them).

## View your work orders & status
- **`/client/jobs`** lists your orders (number, description, status, location, submitted date), newest first. Click a number to open detail.
- Detail (`/client/jobs/[id]`) shows the order number, current status, location, description, scheduled window (if set), and submitted date. You only ever see your own orgs' orders — a link to another client's order returns "not found".

## Add an update
- On a work-order detail page, use **Add an update** (below the Updates list). Your update is shared with the aggregator's team. Updates from the team appear in the same list (author/"Team" + time + message).

## View your locations
- **`/client/locations`** lists your locations with their addresses (grouped by org if you have more than one). Read-only — locations are managed by the aggregator.

## View invoices
- **`/client/invoices`** lists issued invoices across your orders: invoice number, a link to the related job, the **total**, payment status (Unpaid / Partially paid / Paid), and issued/due dates. You see the total only — not a cost breakdown.

## Accept a proposal
- When the aggregator sends you a proposal, it appears in a **Proposals** section on the related work order's detail page (title, total, sent/valid-until dates).
- Click **Accept proposal** to accept. There is no decline button in the portal — if the proposal needs changes, contact the aggregator and they will revise and re-send.
- Once accepted, the proposal is a commitment; a revised quote comes as a new proposal.
