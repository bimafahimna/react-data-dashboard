# Dashboard Smoke Test

A one-off seeding helper for verifying the analytics dashboard end-to-end. It is intentionally **not** part of the application's seed pipeline — the design spec calls for the production database to stay empty of synthetic data. Use this only when validating the dashboard locally.

The script lives at [`prisma/seed-smoke.cjs`](./seed-smoke.cjs).

## What it does

Inserts the minimum data needed so every dashboard panel renders meaningful values:

| Entity | Value |
|---|---|
| `Category` | "Smoke Apparel" |
| `Store` | "Smoke Test Store", USD, owned by the first existing `User` |
| `Product` | SKU `SMOKE-TEE-001`, unit price `$25`, reorder point `5` |
| `Customer` | `smoke@example.com`, `firstOrderAt` = 12 days ago |
| `Order` (today) | 1 order, 2 units, `$50`, `PAID` |
| `Order` (12 days ago) | 1 order, 3 units, `$75`, `PAID` |
| `InventoryMovement` | `+10` PURCHASE (−14 d), then `−3` SALE, `−2` SALE, `−3` ADJUSTMENT → on-hand `2` (below reorder = **LOW** alert) |
| `FxRate` | `USD → EUR @ 0.92`, `asOf` 14 days ago |

The script is **idempotent** — re-running it does not duplicate rows. All operations are scoped to the first `User` in the database (resolved by lowest `accountId`).

## Prerequisites

1. **Database is running**

   ```bash
   docker compose up -d db
   ```

2. **Schema is migrated**

   ```bash
   npx prisma migrate deploy
   ```

3. **At least one `User` exists** — sign up via the app first:

   ```bash
   npm run dev
   ```

   Then visit <http://localhost:3000/signup>. The smoke store is attached to whichever user has the lowest `accountId`.

4. **Environment is loaded** — the script reads `DATABASE_URL` from `.env` (uses `dotenv`).

## Running the smoke test

From the `dashboard/` directory:

```bash
# Insert smoke data
node prisma/seed-smoke.cjs

# Clean up afterwards
node prisma/seed-smoke.cjs --clear
```

After insertion, open <http://localhost:3000/dashboard>.

## Expected dashboard values

### Default view (`?range=daily`)

The default 7-day window catches only today's order.

| Panel | Expected |
|---|---|
| **Revenue tile** | `$50` |
| **Orders tile** | `1` |
| **AOV tile** | `$50` |
| **New customers tile** | `0` (the customer's `firstOrderAt` is 12 days ago, outside the 7-day window → counted as returning) |
| **Revenue trend** | A single non-zero spike today; zeros for the other 6 days |
| **Store leaderboard** | `Smoke Test Store · $50 · 1 order · $50 AOV` |
| **Category share** | `Smoke Apparel · 100%` |
| **Top products** | `Smoke Test Tee · $50 · 2 units` |
| **Inventory alerts** | `Smoke Test Tee · LOW · 2` (this is the canary — if you see the LOW badge, the inventory ledger query is wired correctly end-to-end) |
| **New vs returning** | `0 new, 1 returning` |
| **Top customers** | `smoke@example.com · 1 order · $50` |

### Weekly view (`?range=weekly`)

Switch the timeframe pill to **Weekly**. Both orders now fall inside the 8-week window.

| Panel | Expected |
|---|---|
| **Revenue tile** | `$125` with an upward delta arrow (previous 8-week period had `$0`) |
| **Orders tile** | `2` |
| **AOV tile** | `$62.50` |
| **New customers tile** | `1` (the customer's `firstOrderAt` falls inside the window) |
| **Revenue trend** | Two non-zero weekly buckets (this week and the week ~12 days ago) |
| **Top products** | `Smoke Test Tee · $125 · 5 units` |
| **New vs returning** | `1 new, 0 returning` |

### Monthly view (`?range=monthly`)

Switch to **Monthly**. Same totals as weekly but bucketed by month.

### Currency switch (USD → EUR)

Pick **EUR** in the currency selector. Every monetary value should drop by ~8% (rate `0.92`).

| Panel | Expected |
|---|---|
| **Revenue (daily)** | `~€46` (down from `$50`) |
| **Revenue (weekly)** | `~€115` (down from `$125`) |
| **Inventory alerts** | unchanged (inventory has no currency) |

### Empty states

After running `--clear`, every panel falls back to its `<EmptyState>` message — for example, the inventory panel shows the positive empty state *"All inventory is healthy"*, and the revenue chart shows *"No paid orders in this period"*. This validates the empty-state contract from the design spec (§6.6).

## Owner resolution

The script picks the **first existing user** (`ORDER BY accountId ASC LIMIT 1`) as the store's owner. If no `User` exists, the script exits with a clear error pointing at `/signup`. There is no way to override the owner via flags — for a different account, sign up that user, then run the script. Subsequent runs will re-resolve the same owner (the inserts are scoped via `findFirst`/`upsert`, not by ID).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No User row found.` | Empty `User` table | Sign up via <http://localhost:3000/signup> first |
| Dashboard still shows `—` after seeding | Wrong user is logged in | Make sure the browser session is the same account the seed targeted (lowest `accountId`) |
| Inventory alerts panel shows "All inventory is healthy" after seeding | LOW threshold not met — `reorderPoint` may have been edited | Re-run the script (idempotent) or check `Product.reorderPoint` is still `5` |
| EUR view shows `$` values unchanged | Browser cached the old page | Hard refresh; the search-param navigation does a soft route change |
| `P1001` connection error | Postgres container not running | `docker compose up -d db` |

## Why this isn't a real seed script

The brainstorming output for this feature (`docs/superpowers/specs/2026-06-29-dashboard-analytics-design.md`, Decision #5) explicitly opts out of seed data — the dashboard should handle empty states cleanly and operators are expected to insert real data manually. This smoke script exists purely so that developers can:

1. Verify the analytics pipeline end-to-end after schema or query changes.
2. Visually validate Recharts panels render correctly.
3. Exercise the FX-conversion path without setting up a real multi-currency operation.

It should not be invoked from a Vercel build, a CI pipeline, or any non-developer workflow.
