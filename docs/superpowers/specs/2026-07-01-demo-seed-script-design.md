# Demo Seed Script — Design

**Status:** Draft — pending user review
**Date:** 2026-07-01
**Author:** Brainstorming session
**Target file:** `react-data-dashboard/dashboard/prisma/seed-demo.cjs`
**Companion to:** `prisma/seed-smoke.cjs` (kept as-is, minimal smoke fixture)

---

## 1. Purpose

Populate any Postgres database pointed to by `DATABASE_URL` with a realistic, ~3-month demo dataset so every panel of the dashboard (revenue, customers, top products, low-stock alerts, currency switcher, per-store views) has meaningful, varied data to render. The script must be:

- **Env-driven** — works against whatever DB `DATABASE_URL` points at, like `seed-smoke.cjs`.
- **Idempotent by default** — re-running yields the same end state; tagged rows let cleanup never touch user data.
- **Deterministic** — a seeded PRNG produces the same dataset every run, so screenshots and bug reports are reproducible.
- **Self-correcting** — engineered invariants (low-stock products, top sellers) are guaranteed by construction, not by hope.

## 2. Non-goals

- Not a load-test / stress-test seed. Volume targets "medium" (~2.4k orders), seeds in seconds.
- Not a fixture for unit tests. Those live next to their tests.
- Does not modify the schema. Works against the schema in `prisma/schema.prisma` as of this date.
- Does not create/modify `User` rows. Owner must already exist.

## 3. Invocation contract

### File location
`react-data-dashboard/dashboard/prisma/seed-demo.cjs` — CommonJS, same pattern as `seed-smoke.cjs`.

### Runtime
- Loads `.env` via `require("dotenv").config({ path: ".env" })`.
- Connects via `PrismaPg` adapter + `PrismaClient` from `../generated/prisma`.
- No new runtime dependencies. (Uses only `dotenv`, `@prisma/adapter-pg`, `@prisma/client` — already in `package.json`.)

### Environment variables read
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Standard Prisma connection string. |
| `SEED_OWNER_EMAIL` | no | first `User` row (by `accountId` asc) | Email of the `User` that will own the 3 demo stores. Fails fast with a clear message if neither this env nor any `User` row exists. |
| `SEED_RANDOM_SEED` | no | `"react-dashboard-demo"` | String seed for the deterministic PRNG. |

### CLI flags
| Invocation | Effect |
|---|---|
| `node prisma/seed-demo.cjs` | **Default**: clear all demo-tagged rows, then reseed. Idempotent. |
| `node prisma/seed-demo.cjs --clear` | Clear demo-tagged rows only, no reseed. |
| `node prisma/seed-demo.cjs --keep` | Append a fresh additive batch (tagged `demo-seed-v1-batch-{ts}`), no clear, **skips the corrective inventory step**. |
| Both `--clear` and `--keep` | Error, exit 2. |

### npm scripts added to `package.json`
```json
"seed:demo":       "node prisma/seed-demo.cjs",
"seed:demo:clear": "node prisma/seed-demo.cjs --clear"
```

### Tagging convention (so `--clear` is surgical)

| Entity | Tag location | Value |
|---|---|---|
| `Store.name` | name prefix | `Demo — ` |
| `Product.sku` | sku prefix | `DEMO-` |
| `Customer.email` | email suffix | `@demo.seed` |
| `InventoryMovement.note` | note field | `demo-seed-v1` (or `demo-seed-v1 corrective`, or `demo-seed-v1-batch-{ts}` for `--keep`) |
| `FxRate` | (no note field) | identified by `(baseCurrency, quoteCurrency) ∈ DEMO_PAIRS` AND `asOf ∈ [from-1d, to]` |
| `Category` | not tagged | upserted by name; shared/idempotent; never deleted by `--clear` |

`User` rows are **never** read-modified-written or deleted.

## 4. Data design

### 4.1 Currencies and stores

Demo currency set: `["USD", "EUR", "GBP", "JPY", "IDR"]`.

Three stores (all owned by the resolved owner user):

| # | name | location | baseCurrency |
|---|---|---|---|
| 1 | `Demo — Jakarta Flagship` | `Jakarta` | `IDR` |
| 2 | `Demo — Berlin Outlet` | `Berlin` | `EUR` |
| 3 | `Demo — NYC Showroom` | `New York` | `USD` |

Three distinct store currencies exercise the FX switcher in every direction.

### 4.2 Categories

Five categories, upserted by unique `name`, shared across stores:

`Apparel`, `Footwear`, `Accessories`, `Electronics`, `Home`.

Price bands per category (used for product `unitPriceCents`):

| Category | Min ¢ | Max ¢ |
|---|---|---|
| Apparel | 1,500 | 8,000 |
| Footwear | 3,000 | 15,000 |
| Accessories | 800 | 5,000 |
| Electronics | 8,000 | 80,000 |
| Home | 2,000 | 20,000 |

Prices are denominated in the **store's** `baseCurrency` (cents convention preserved — IDR-denominated rows just have larger integers; schema is `Int`, no overflow risk for this dataset).

### 4.3 Products — 10 per store = 30 total

SKU pattern: `DEMO-{STORE_CODE}-{NNN}` where `STORE_CODE ∈ {JKT, BER, NYC}` and `NNN` is `001..010` per store.

Names drawn from a small fixture pool keyed by category (e.g. Apparel: `"Crewneck Tee"`, `"Linen Shirt"`, …).

`reorderPoint`: random integer in `[5, 15]` per product.

**Inventory profile per store** (engineered, drives alerts + top-products):

| Profile | Count per store | Target final on-hand |
|---|---|---|
| Top seller | 2 | `[50, 150]` |
| Healthy | 5 | `[reorderPoint × 2, reorderPoint × 4]` |
| LOW | 2 | `(0, reorderPoint)` exclusive both ends |
| CRITICAL | 1 | `[0, 1]` |

The *target* is picked deterministically from the PRNG when the product is created. The *actual* end state is forced to match the target via a final corrective movement (§4.5).

### 4.4 Customers, orders, items

- **Customers:** 90 total. Emails `demo-customer-001@demo.seed` … `demo-customer-090@demo.seed`. Names from a fixture pool. `firstOrderAt` set after orders are generated (= each customer's earliest `Order.placedAt`).
- **Time window:** `to = now (UTC)`, `from = to - 92 days`. Covers daily/weekly/monthly dashboard ranges with headroom.
- **Per-store base daily order count:** Jakarta `10`, Berlin `7`, NYC `9`.
- **Daily count formula:** `round(base × weekdayFactor × seasonality × noise)`, min 1.
  - `weekdayFactor`: Mon–Thu `1.0`, Fri `1.15`, Sat `1.35`, Sun `0.6`.
  - `seasonality`: linear `1.0 → 1.25` from `from` to `to`.
  - `noise`: PRNG `uniform(0.85, 1.15)`.
- **Customer pick per order:** 70% chance from a "repeat" pool of 25 fixed customer IDs (drives returning-customer metrics), 30% uniform draw from all 90.
- **Status mix:** `PAID 92%`, `PENDING 5%`, `REFUNDED 2%`, `CANCELLED 1%`.
  - `PAID` → set `paidAt = placedAt + uniform(0, 15) min`.
  - `REFUNDED` → set `paidAt` (as above) and `refundedAt = paidAt + uniform(1, 30) days`, capped at `to`.
  - Others → null.
- **Currency:** order's `currency` = store's `baseCurrency`.
- **`placedAt`:** random time within the calendar day (UTC).
- **Items per order:** `1..4` distinct products from the order's store. Product picked by **weighted sample**:
  - Top seller × 5
  - Healthy × 1
  - LOW × 0.3
  - CRITICAL × 0.1
- **Per item:** `quantity ∈ [1, 3]`, `unitPriceCents` snapshotted from product, `subtotalCents = qty × unit`.
- **Per order:** `totalCents = Σ subtotals`.

Expected scale: ~2,400 orders, ~5,500 order items.

### 4.5 Inventory movements

For each product, emit (chronologically):

1. **Opening PURCHASE** at `from - 1 day`. Amount by profile:
   - Top seller: `+200..300`
   - Healthy: `+80..120`
   - LOW: `+20..30`
   - CRITICAL: `+10..15`
2. **SALE rows** — one per `OrderItem` for this product, with `delta = -quantity`, `orderId` set, `occurredAt = order.placedAt`.
3. **Periodic restock PURCHASEs:**
   - Top sellers: every ~14 days, `+50..100`.
   - Healthy: every ~21 days, `+30..60`.
   - LOW / CRITICAL: one early restock (~day 10), none after.
4. **Realism noise** (does not affect final state materially, but corrective row in step 5 absorbs any drift):
   - ~3% of products: one `ADJUSTMENT` of `-1..-3` at a random date (shrinkage).
   - ~5% of `PAID` orders: emit a `RETURN` of `+1` for one of its line items, `occurredAt = order.placedAt + uniform(1, 10) days`.
5. **Corrective row** (the load-bearing invariant guarantor) at `to - 1 hour`:
   - Compute `actual = Σ deltas so far`.
   - Pick `target` deterministically from the product's profile band.
   - If `actual < target`: emit `PURCHASE +(target - actual)`, note `"demo-seed-v1 corrective"`.
   - If `actual > target`: emit `ADJUSTMENT -(actual - target)`, same note.
   - If equal: skip.

All movements are tagged: `note = "demo-seed-v1"` (or `"demo-seed-v1 corrective"`, or batch tag for `--keep`).

**For `--keep`:** steps 1–4 still run with new batch tag; **step 5 is skipped** because the existing dataset's end-state should not be perturbed by additive batches.

### 4.6 Invariants (sanity assertions; should never fire after §4.5)

For every product:
- `final on-hand (= Σ delta) >= 0` — final stock never negative. (We do **not** assert running non-negativity mid-history; sales weighting and one-time restock for LOW/CRITICAL could occasionally produce a transient negative running sum, which is invisible in the dashboard because it derives current stock from the total sum, not a per-day rolling counter. The corrective row in §4.5 guarantees the final value.)
- LOW: `0 < final on-hand < reorderPoint`.
- CRITICAL: `final on-hand <= 1`.
- Top seller: `final on-hand >= reorderPoint × 3`.

Failure → throw inside the transaction → automatic rollback → exit 1 with the failing product's SKU and the actual/target values.

### 4.7 FX rates

- **Currencies:** `USD, EUR, GBP, JPY, IDR`.
- **Pairs:** full directed cross excluding identity = 20 pairs.
- **Snapshots:** daily for the 92-day window = **20 × 92 = 1,840 rows**.
- **Anchor rates as of `to`** (rounded, plausible):
  - `USD→EUR 0.92`, `USD→GBP 0.79`, `USD→JPY 157.0`, `USD→IDR 16,200`.
- **Derivation:** all non-USD pairs computed by triangulation through USD (e.g. `EUR→JPY = (1/0.92) × 157.0`). Inverses are exact reciprocals of their forward.
- **Historical drift:** for each (pair, day), `rate = anchor × (1 + walk[day])`, where `walk` is a seeded AR(1) random walk with σ ≈ 0.3%/day, clamped to ±4%. Independent walks per *base* pair (USD→X); inverse and cross pairs are recomputed from those each day so the matrix stays self-consistent.
- **`asOf` convention:** every demo FxRate row uses **exact midnight UTC** of its target day (`Date.UTC(y, m, d, 0, 0, 0, 0)`). This is the key distinguisher from the smoke seed, which uses `setUTCDate(...-14)` on a `new Date()` and therefore carries the current sub-day time in `asOf`. The clear filter (§5) keys on this midnight pattern so smoke FX rows survive.
- **Precision:** values passed as strings (e.g. `"0.92000000"`) into Prisma's `Decimal(18,8)` field to avoid JS float artifacts.
- **Insertion:** `prisma.fxRate.createMany({ data, skipDuplicates: true })` — re-running `--keep` is safe; default flow has already cleared.

## 5. Execution flow

```
main()
├── load .env, build PrismaPg adapter + PrismaClient
├── parse flags (--clear, --keep); error if both
├── resolve owner (SEED_OWNER_EMAIL or first User); fail fast if none
├── init seeded PRNG from SEED_RANDOM_SEED
├── if not --keep: clear phase (see below)
├── if --clear only: print summary, disconnect, exit 0
├── prisma.$transaction(async tx => {
│     seed categories (upsert by name)
│     seed stores (3, upsert via find-or-create like smoke)
│     seed products (createMany, refetch IDs by sku LIKE 'DEMO-%')
│     seed customers (createMany, refetch by email LIKE '%@demo.seed')
│     generate orders + items (per store, day-by-day; chunked Promise.all of 50)
│     generate inventory movements (chunked createMany, 1000 per batch)
│     if not --keep-additive: emit corrective movements
│     generate FX rates (single createMany skipDuplicates)
│     assert invariants → throw on failure
│   }, { timeout: 120_000 })
├── print summary table
└── disconnect, exit 0
```

### Clear phase order (children → parents, demo-tagged only)
```
inventoryMovement  WHERE note LIKE 'demo-seed-v1%'
orderItem          WHERE order.customer.email LIKE '%@demo.seed'
order              WHERE customer.email LIKE '%@demo.seed'
product            WHERE sku LIKE 'DEMO-%'
customer           WHERE email LIKE '%@demo.seed'
store              WHERE name LIKE 'Demo — %'
fxRate             WHERE baseCurrency IN DEMO_CURRENCIES
                     AND quoteCurrency IN DEMO_CURRENCIES
                     AND asOf BETWEEN (to - 93d) AND to
                     AND EXTRACT(EPOCH FROM asOf) % 86400 = 0   -- midnight-UTC only
category           // not cleared
```

The midnight-UTC predicate is the surgical part: the demo writes all FX rows at exact `Date.UTC(y, m, d, 0, 0, 0)`; the smoke seed writes at a sub-day timestamp (`new Date()` with only the date component shifted), so smoke FX rows are never touched by demo `--clear`. Implemented in Prisma with a raw SQL `executeRaw` for the cleanup query (Prisma's typed query API can't express the modulus predicate), inside the same transaction.

## 6. Output

### Success (stdout)
```
Demo seed complete (seed="react-dashboard-demo", elapsed 4.2s):
  Stores:      3 (Jakarta IDR, Berlin EUR, NYC USD)
  Categories:  5
  Products:    30  (6 top-sellers, 6 LOW, 3 CRITICAL, 15 healthy)
  Customers:   90  (~25 repeat)
  Orders:      2,387  (PAID 2,196 / PENDING 119 / REFUNDED 48 / CANCELLED 24)
  OrderItems:  5,842
  Movements:   6,310
  FxRates:     1,840  (5×4 pairs × 92 days)
  Window:      2026-03-31 → 2026-07-01

Open http://localhost:3000/dashboard to verify.
```

### Failure
- Owner not found → `"No User row found with email <X> (or no users at all). Sign up at http://localhost:3000/signup first, or set SEED_OWNER_EMAIL."` exit 1.
- DB unreachable → underlying Prisma error, exit 1.
- Invariant violation → `"Invariant failed: product DEMO-JKT-003 expected LOW (final < reorderPoint=8), got 11. This is a seed-script bug."` exit 1. Transaction rolled back.
- Conflicting flags → `"--clear and --keep are mutually exclusive."` exit 2.

## 7. Module structure inside `seed-demo.cjs`

Single file, ordered top-down:

1. **Constants** — `DEMO_TAG`, `DEMO_CURRENCIES`, `DEMO_PAIRS`, `STORES`, `CATEGORIES`, fixture pools, anchor rates, profile bands.
2. **PRNG helpers** — `xfnv1a(str)` string-hash → seed, `mulberry32(seed)` → `() => float`. Plus `randInt(rng, min, max)`, `pick(rng, arr)`, `weightedPick(rng, items, weights)`, `gaussian(rng)` (Box-Muller).
3. **Generators** — `buildProducts`, `buildCustomers`, `buildOrdersForStore`, `buildInventoryForProduct`, `buildFxRates`.
4. **Persistence helpers** — `chunked(arr, size, fn)` for batched `createMany`, `assertInvariants(products, movements)`.
5. **Clear phase** — `clearDemo(tx)`.
6. **Seed phase** — `seedDemo(tx, owner, rng)`.
7. **`main()`** — argv parsing, env reading, orchestration, summary print.

Total expected size: ~450–550 lines.

## 8. Open questions / explicit non-decisions

- **`--keep` corrective behavior:** decided to skip corrective rows for additive batches (§4.5). If you later want each batch to also converge, that's a one-flag addition.
- **Time zones:** all timestamps stored UTC, matching schema. Dashboard rendering already handles TZ.
- **Locale of names:** customer/product names use a single English fixture pool. Could be localized per store later but YAGNI now.

## 9. Test plan (manual, post-implementation)

1. Fresh DB: `prisma migrate deploy && npm run seed:demo`. Confirm summary line counts.
2. Open `http://localhost:3000/dashboard`:
   - Daily / Weekly / Monthly views all show non-empty revenue series.
   - Currency switcher converts to all 5 currencies; values change.
   - Per-store filter shows 3 stores.
   - Low-stock alerts panel shows ~9 alerts across stores (6 LOW + 3 CRITICAL).
   - Top-products panel shows the top 6 sellers ranked clearly above the rest.
3. Re-run `npm run seed:demo`. Confirm no errors, summary numbers identical (determinism).
4. Run `npm run seed:demo:clear`. Confirm DB has no `Demo —` stores, no `DEMO-` SKUs, no `@demo.seed` customers. Confirm smoke data (if previously run) is untouched.
5. Re-run smoke + demo together. Confirm both coexist and neither's `--clear` touches the other.
6. Edit one `FxRate` row directly in pgAdmin; refresh dashboard; confirm conversion uses the edited rate.
