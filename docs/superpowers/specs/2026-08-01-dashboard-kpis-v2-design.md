# Dashboard KPIs v2 — Design Spec

- **Date:** 2026-08-01
- **Scope:** `react-data-dashboard/dashboard` (Next.js 15 + React 19 + Prisma 7 + Postgres + Tailwind 4)
- **Status:** Approved design, ready for implementation planning
- **Follows:** `2026-06-29-dashboard-analytics-design.md`
- **Part of decomposition:** Sub-project A of a 5-part expansion (A = main dashboard v2, B = interactivity/export, C = product analytics page, D = customer analytics page, E = segmentation builder). This spec covers **A only**.

## 1. Goals

Extend the approved analytics dashboard with a wider KPI header and a per-store breakdown, so the top of the dashboard answers:

- What is the current period's Revenue, Orders, Unique Customers, AOV, New Customers, Repeat Customers, and Items Sold?
- How does each of those compare to the same-length previous period and to the same window one year ago (both nominal and percentage)?
- How is each of those distributed across the user's stores?

## 2. Non-goals

Explicitly out of scope; each is its own follow-up sub-project:

- Click-through drill-down from tiles/rows, "table behind chart" toggle, CSV/Excel export — **Sub-project B**.
- Dedicated product analytics page (`/dashboard/products`) — **Sub-project C**.
- Dedicated customer analytics page (`/dashboard/customers`) and customer profile pages — **Sub-project D**.
- Rule-based customer segmentation builder — **Sub-project E**.
- Reworking existing panels (revenue chart, leaderboard, category donut, top products/customers, inventory alerts) — they stay as-is.
- Custom date-range picker; still preset `daily / weekly / monthly` from the base spec.
- Real-time push updates.

## 3. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Per-store view shape | Compact matrix table below the aggregate KPI row; one row per owned store; sortable |
| 2 | Period-over-period basis | Show BOTH: same-length previous period (primary) AND same window one year ago (secondary) |
| 3 | Nominal vs percentage growth | Prev-period tile chip shows BOTH `%` and nominal delta; YoY chip shows `%` only (muted) |
| 4 | Customer KPI definitions | Standard: Unique = distinct `customerId` with ≥1 PAID order in period. New = customers whose `firstOrderAt ∈ [from, to)`. Repeat = customers with `firstOrderAt < from` and ≥1 order in period |
| 5 | Guest orders (`customerId = null`) | Excluded from all customer counts |
| 6 | Refund / cancel handling | Only `status = 'PAID'` orders count for every KPI; consistent with base spec |
| 7 | Items Sold source | `SUM(OrderItem.quantity)` for items belonging to PAID orders in window |
| 8 | Query strategy | One consolidated analytics function; 3 raw SQL queries per window × 3 windows = 9 parallel queries |
| 9 | Per-store matrix content | Store, Revenue, Orders, Unique Customers, AOV, New, Repeat, Items — current-period values only, no per-cell deltas |
| 10 | Zero-activity stores | Still shown in matrix with `—` placeholders (never hidden) |
| 11 | Schema changes | None |
| 12 | Materialized aggregates | Not now — premature. Consolidated function is fast enough with existing indexes |

## 4. Architecture

Strict additive extension of the base spec. No new layer.

```text
┌─────────────────────────────────────────────────────────────────┐
│                  app/dashboard/page.tsx (RSC)                    │
│                                                                  │
│  ┌───────────────────────────┐   ┌─────────────────────────────┐│
│  │  <Suspense> KpiRow        │   │  <Suspense> PerStoreKpiTable││ ← NEW slot
│  │   (fetches DashboardKpis) │   │   (fetches PerStoreKpiRow[])││
│  └───────────────────────────┘   └─────────────────────────────┘│
│  … existing panels below, unchanged …                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │   lib/analytics/kpis.ts     │  ← NEW
              │   (getDashboardKpis,        │
              │    getPerStoreKpis)         │
              │                             │
              │   lib/analytics/timeframe.ts│  ← extend: yoyWindow()
              │   lib/analytics/fx.ts       │  ← unchanged
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │    lib/repository/*         │  ownerId-scoped, unchanged
              └──────────────┬──────────────┘
                             │
                       Prisma + Postgres
```

Files touched:

- **New:** `lib/analytics/kpis.ts`, `components/dashboard/kpi/PerStoreKpiTable.tsx`, `components/dashboard/shared/TableSkeleton.tsx`.
- **Extended:** `lib/analytics/types.ts` (add `KpiSummary`, `DashboardKpis`, `PerStoreKpiRow`, add `changeNominal` to `Delta`), `lib/analytics/timeframe.ts` (add `yoyWindow`), `components/dashboard/kpi/KpiTile.tsx` (add `deltaPrev` + `deltaYoy`), `components/dashboard/kpi/KpiRow.tsx` (swap to `getDashboardKpis`), `app/dashboard/page.tsx` (one new `<Suspense>` block).
- **Untouched:** all other analytics modules, all other dashboard panels, repository, schema, migrations.

## 5. Data model & SQL

**No schema changes.** Existing indexes are sufficient:

- `Order @@index([storeId, status, placedAt])` — used by all KPI queries and the per-store matrix.
- `Order @@index([placedAt])` — fallback.

Optional (add only if profiling shows it): `Customer @@index([firstOrderAt])`.

### 5.1 Window math

Three windows per request, all UTC. Built by extending the existing `resolveWindow(range, from?, to?, now?)` helper in `lib/analytics/timeframe.ts`.

Current shape (existing):

```ts
export interface ResolvedWindow {
  from: Date; to: Date;
  previousFrom: Date; previousTo: Date;      // same-length prev period, already computed
  bucket: Bucket;
}
```

Extend to add YoY fields:

```ts
export interface ResolvedWindow {
  from: Date; to: Date;
  previousFrom: Date; previousTo: Date;
  yoyFrom: Date; yoyTo: Date;                // NEW
  bucket: Bucket;
}
```

YoY semantics: `yoyFrom / yoyTo` are `from / to` shifted back exactly one year using calendar arithmetic on UTC year/month/day. Feb 29 in a leap year maps to Feb 28 of the previous year. DST is irrelevant because all timestamps are UTC. Implemented by a private `shiftYearsUtc(d, -1)` helper that constructs a new `Date` via `Date.UTC(y-1, m, day, hh, mm, ss, ms)` and clamps day if the target month is shorter.

### 5.2 KPI definitions

| KPI | Formula |
|---|---|
| Revenue | `SUM(Order.totalCents)` where `status = 'PAID'`, FX-converted to `scope.currency` |
| Orders | `COUNT(*)` where `status = 'PAID'` |
| Unique Customers | `COUNT(DISTINCT customerId) FILTER (WHERE customerId IS NOT NULL)` |
| AOV | Revenue / Orders (JS-derived; 0 when Orders = 0) |
| New Customers | `COUNT(DISTINCT o.customerId)` joined to `Customer` where `firstOrderAt ∈ [from, to)` |
| Repeat Customers | `COUNT(DISTINCT o.customerId)` joined to `Customer` where `firstOrderAt < from` |
| Items Sold | `SUM(OrderItem.quantity)` for items on PAID orders in window |

Guest orders (`customerId IS NULL`) are excluded from Unique / New / Repeat counts but are included in Revenue, Orders, AOV, and Items Sold.

### 5.3 SQL — three queries per window

Executed as raw SQL via `prisma.$queryRaw`. Each query is safe from injection (all values bound; only `date_trunc` bucket literal is whitelisted in the base spec, and this section doesn't use `date_trunc`).

**Q1 — order-level aggregates, grouped by currency for FX:**

```sql
SELECT currency,
       SUM("totalCents")::bigint AS revenue_cents,
       COUNT(*)::bigint          AS orders,
       COUNT(DISTINCT "customerId")
         FILTER (WHERE "customerId" IS NOT NULL) AS unique_customers
FROM "Order"
WHERE "storeId" = ANY($storeIds)
  AND status = 'PAID'
  AND "placedAt" >= $from AND "placedAt" < $to
GROUP BY currency;
```

**Q2 — items sold:**

```sql
SELECT SUM(oi.quantity)::bigint AS items
FROM "OrderItem" oi
JOIN "Order" o ON o.id = oi."orderId"
WHERE o."storeId" = ANY($storeIds)
  AND o.status = 'PAID'
  AND o."placedAt" >= $from AND o."placedAt" < $to;
```

**Q3 — new / repeat customer counts:**

```sql
SELECT
  COUNT(DISTINCT o."customerId") FILTER (
    WHERE c."firstOrderAt" >= $from AND c."firstOrderAt" < $to
  ) AS new_customers,
  COUNT(DISTINCT o."customerId") FILTER (
    WHERE c."firstOrderAt" <  $from
  ) AS repeat_customers
FROM "Order" o
JOIN "Customer" c ON c.id = o."customerId"
WHERE o."storeId" = ANY($storeIds)
  AND o.status = 'PAID'
  AND o."placedAt" >= $from AND o."placedAt" < $to;
```

Executed 3× (one per window) = **9 parallel queries** for the KPI section, all launched from a single `Promise.all` in `getDashboardKpis`.

### 5.4 Per-store matrix — one grouped set, current window only

Same three shapes as Q1 / Q2 / Q3, but grouped by `storeId` and joined to `Store` for name/location, filtered by `s."ownerId" = $ownerId`. Executed as three parallel queries; JS composes rows keyed by `storeId`, applies FX per row's `currency`, and pads with zero rows for stores in the user's store list that produced no rows.

Total DB round trips for the whole KPI section: **9 + 3 = 12**, all parallel.

### 5.5 FX handling

Reuses `lib/analytics/fx.ts` unchanged. Each Q1 row and per-store row carries its `currency`; JS converts each cents value to `scope.currency` before summing. Missing rate → same non-blocking banner behavior as the base spec (`FxWarningBanner`).

### 5.6 Cache

Uses the same `unstable_cache` wrapper and `revalidateTag('analytics')` as the base spec. The two new functions get their own cache keys:

- `analytics:kpis:{ownerId}:{storeId ?? "all"}:{from}:{to}:{currency}`
- `analytics:kpis:perStore:{ownerId}:{storeId ?? "all"}:{from}:{to}:{currency}`

Both invalidated by the same `analytics` tag mutations already invalidate.

## 6. Analytics module

### 6.1 Types (`lib/analytics/types.ts`)

`Delta<T = number>` already exists with `{ current, previous, changePct, direction }`. Preserve the generic and extend it:

```ts
export interface Delta<T = number> {
  current: T;
  previous: T;
  changeNominal: number;      // NEW: current − previous. Money in scope.currency major units,
                              //      counts in raw units. Populated whenever T = number
                              //      (all current call-sites); safe default 0 otherwise.
  changePct: number;          // percent, e.g. 12.4 for +12.4%. 0 when previous = 0.
  direction: Direction;
}

export interface KpiSummary {
  current: number;
  deltaPrev: Delta;           // vs same-length previous period
  deltaYoy: Delta;            // vs same window one year ago
}

export interface DashboardKpis {
  revenue:          KpiSummary;
  orders:           KpiSummary;
  uniqueCustomers:  KpiSummary;
  aov:              KpiSummary;
  newCustomers:     KpiSummary;
  repeatCustomers:  KpiSummary;
  itemsSold:        KpiSummary;
}

export interface PerStoreKpiRow {
  storeId: number;
  storeName: string;
  location: string;
  baseCurrency: string;
  revenue: number;
  orders: number;
  uniqueCustomers: number;
  aov: number;
  newCustomers: number;
  repeatCustomers: number;
  itemsSold: number;
}
```

`Delta` gains a `changeNominal` field. Existing consumers of `Delta` can ignore it — the field is always populated but never required to be read.

### 6.2 Public API (`lib/analytics/kpis.ts`)

```ts
export async function getDashboardKpis(scope: AnalyticsScope): Promise<DashboardKpis>;
export async function getPerStoreKpis(scope: AnalyticsScope): Promise<PerStoreKpiRow[]>;
```

Both enforce `ownerId` scoping via the repository layer. `AnalyticsScope.storeId`, if set, must belong to `ownerId`; otherwise the repository rejects.

### 6.3 `timeframe.ts` changes

- Extend `ResolvedWindow` with `yoyFrom` and `yoyTo` (see 5.1).
- Extend `resolveWindow` to populate `yoyFrom` / `yoyTo` via a new private `shiftYearsUtc(date, delta)` helper.
- Update the existing `buildDelta(current, previous): Delta` to also populate `changeNominal`, and fix the edge case where `previous === 0 && current !== 0` currently returns `"flat"` — it should return `direction: "up"` (or `"down"` for negative current), with `changePct = 0` (undefined-percent case is signalled by `previous === 0`, not by direction).

Concrete post-change `buildDelta`:

```ts
export function buildDelta(current: number, previous: number): Delta {
  const changeNominal = current - previous;
  let direction: Direction;
  if (changeNominal > 0) direction = "up";
  else if (changeNominal < 0) direction = "down";
  else direction = "flat";
  const changePct = previous === 0 ? 0 : (changeNominal / previous) * 100;
  return { current, previous, changeNominal, changePct, direction };
}
```

Callers of `buildDelta` in existing analytics modules (`revenue.ts`, `products.ts`, etc.) do not need to change — the new field is additive.

### 6.4 `getDashboardKpis` flow

1. Resolve `storeIds` from `(ownerId, scope.storeId?)` via repository.
2. Take `from / to`, `previousFrom / previousTo`, `yoyFrom / yoyTo` from `ResolvedWindow`.
3. `Promise.all` of 9 raw queries (3 shapes × 3 windows).
4. Reduce currency-grouped rows to single numbers via `fx.convert`.
5. For each KPI, return `{ current, deltaPrev: buildDelta(current, prev), deltaYoy: buildDelta(current, yoy) }`.

### 6.5 `getPerStoreKpis` flow

1. Resolve `storeIds` and load the store list (`{ id, name, location, baseCurrency }`).
2. `Promise.all` of 3 grouped-by-`storeId` queries.
3. Join in JS on `storeId`, apply FX per row, fill missing stores with zero rows.
4. Sort by revenue desc as default order (client can re-sort).

### 6.6 Empty-state contract

- No orders in window → every `KpiSummary.current = 0`, all `Delta` fields zero, `direction = "flat"`.
- No stores → `getPerStoreKpis` returns `[]`; the matrix renders its empty state.
- Some stores, no orders → one zero row per store.

## 7. UI

### 7.1 `KpiTile.tsx` (extend)

```ts
interface KpiTileProps {
  label: string;
  value: string;               // pre-formatted (currency, count, etc.)
  isEmpty?: boolean;           // renders "—" and hides delta chips
  deltaPrev?: Delta;           // primary delta chip: % AND nominal
  deltaYoy?: Delta;            // secondary delta chip: % only, muted
  hint?: string;               // sr-only descriptor for the range window
}
```

Layout:

```
┌────────────────────────────────────┐
│ Label                              │
│ VALUE                              │
│ ▲ +12.4% · +$3.2k  vs prev period  │
│ ▲  +8.1%           vs last year    │
└────────────────────────────────────┘
```

Chip colors: emerald-50 / emerald-700 (up), rose-50 / rose-700 (down), slate-100 / slate-600 (flat). `aria-label` on the tile summarizes both deltas in plain language.

### 7.2 `KpiRow.tsx` (rework)

Server component. One call to `getDashboardKpis(scope)`; renders 7 tiles in two rows:

```
Desktop grid:
  Row 1 (4-up): Revenue | Orders | Unique Customers | AOV
  Row 2 (3-up): New Customers | Repeat Customers | Items Sold

Tablet: 2-up, tiles wrap.
Mobile: 1-up stack.
```

Values are formatted at this layer:

- Money → `Intl.NumberFormat` in `scope.currency`.
- Counts → grouped integer format.
- AOV → `Intl.NumberFormat` in `scope.currency`.
- Items Sold → integer.

### 7.3 `PerStoreKpiTable.tsx` (new, client component)

Sortable table below the KPI row. Sort is pure client-side over the already-fetched array (no re-navigation).

Columns: **Store | Revenue | Orders | Unique | AOV | New | Repeat | Items**.

- Default sort: Revenue desc.
- Click column header → toggle sort direction; `aria-sort` announced.
- Store cell: name + subtle location line; no navigation link in this sub-project (that's B/D).
- Empty state: `"No stores yet."` with a link to `/dashboard/stores`.
- Zero-activity stores: numeric cells render `—`, still shown.

Header sketch:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Per-store breakdown                                                        │
├────────────────────────────────────────────────────────────────────────────┤
│ Store          │ Revenue │ Orders │ Unique │  AOV  │ New │ Repeat │ Items │
│ Jakarta Pusat  │ $12,400 │    182 │    140 │   $68 │  32 │    108 │ 1,204 │
│ Bandung        │  $8,100 │    120 │     95 │   $67 │  21 │     74 │   812 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 `app/dashboard/page.tsx` edit

One new `<Suspense fallback={<TableSkeleton />}>` block containing `<PerStoreKpiTable scope={scope} />`, placed directly below the existing KPI row Suspense. Nothing else changes.

### 7.5 Skeletons

- Reuse `ChartSkeleton` for the KPI row (existing).
- New `TableSkeleton` (`components/dashboard/shared/TableSkeleton.tsx`): 7 shimmering rows × 8 columns.

### 7.6 Style

- Existing Tailwind tokens: `rounded-2xl border bg-white shadow-sm`, slate + indigo + emerald palette. No new colors.
- YoY chip uses muted slate variants to visually de-emphasize versus the primary prev-period chip.

### 7.7 Accessibility

- Tiles: `aria-label` with plain-language summary including both deltas ("Revenue $12,400, up 12.4% versus previous 7 days, up 8.1% versus last year.").
- Matrix: `<table>` with `<caption>`, `<th scope="col">`, `aria-sort` state on the active sort column.
- All interactive controls are real `<button>` elements with visible focus rings (existing tokens).

## 8. Error handling

Follows the base spec. Specific to this sub-project:

- `getDashboardKpis` and `getPerStoreKpis` never throw for empty data; they return zeros.
- If any of the 12 SQL queries throws, the corresponding function throws an `AnalyticsError({ code: "DB_UNAVAILABLE" })`; the per-panel `<ErrorBoundary>` around the KPI row or the matrix catches it independently — one section failing does not take down the other.
- FX missing behaves as in base spec: excluded orders + `FxWarningBanner` at the top of the dashboard.
- Zod validation of `searchParams` is unchanged; invalid `storeId` for owner → treated as "all stores".

## 9. Testing

All Vitest, no new frameworks.

### 9.1 Pure unit — `lib/analytics/__tests__/`

- `timeframe.test.ts` (extend):
  - `resolveWindow` populates `yoyFrom / yoyTo` correctly for monthly / weekly / daily ranges.
  - Leap-day edge: `from = 2028-02-29` produces `yoyFrom = 2027-02-28`.
  - `buildDelta` regression tests: adds `changeNominal`; fixes the `previous = 0 && current > 0` case to `direction = "up"`; unchanged behavior for other paths.

### 9.2 Integration — `lib/analytics/__tests__/kpis.integration.test.ts`

Uses the existing `@prisma/adapter-better-sqlite3` fixture.

Scenarios:

1. **PAID filter** — PENDING / REFUNDED / CANCELLED orders present but excluded from every KPI.
2. **Multi-currency** — USD + EUR orders + fixed `FxRate`; Revenue converts to target currency; AOV uses converted revenue.
3. **`ownerId` isolation** — owner B's data absent from owner A's KPIs, even with spoofed `?storeId=`.
4. **`storeId` filter** — narrows to one store; matrix returns exactly one row.
5. **Empty period** — no orders → all zeros, deltas flat; matrix returns one row per owned store with zeros.
6. **New / Repeat semantics:**
   - `firstOrderAt` inside window → counted as New only.
   - `firstOrderAt` before window and order in window → counted as Repeat only.
   - `firstOrderAt` before window, no order in window → counted in neither.
   - Guest order (`customerId = null`) → excluded from Unique / New / Repeat.
7. **PoP + YoY math** — fixture with known values in current / prev / yoy; assert `changePct`, `changeNominal`, `direction` per KPI.
8. **Items sold** — refunded / cancelled order items excluded; multiple items per order summed correctly.
9. **Per-store zero rows** — owner with 3 stores, 1 has orders → matrix returns 3 rows, 2 zero.

### 9.3 Component smoke — `components/dashboard/__tests__/`

- `KpiTile.test.tsx`: renders value + both delta chips with correct colors/arrows; `isEmpty` renders `—` and hides chips; `aria-label` includes both deltas.
- `PerStoreKpiTable.test.tsx`: sortable columns re-order rows; empty stores list shows the empty-state link; `aria-sort` set on active header.

### 9.4 Out of scope

- Playwright E2E.
- Visual regression.
- Performance / load tests (revisit only if `getDashboardKpis` exceeds 200ms p95 with realistic data).

## 10. Migration plan

No database migration. No data backfill. This is a pure code change.

## 11. Implementation order (rough — for the plan)

1. `types.ts` — add `changeNominal` to `Delta`; add `KpiSummary`, `DashboardKpis`, `PerStoreKpiRow`.
2. `timeframe.ts` — extend `ResolvedWindow` and `resolveWindow` with YoY; add `shiftYearsUtc`; update `buildDelta` for `changeNominal` and the `previous = 0` direction fix; unit tests.
3. `lib/analytics/kpis.ts` — `getDashboardKpis` (9 raw queries + FX reduce), `getPerStoreKpis` (3 grouped queries + FX reduce + zero-fill).
4. Integration tests for both functions.
5. `KpiTile.tsx` — extend props; visual + a11y updates.
6. `KpiRow.tsx` — swap data source to `getDashboardKpis`; re-lay-out to 4+3.
7. `TableSkeleton.tsx`, `PerStoreKpiTable.tsx` — new components; client-side sort.
8. `app/dashboard/page.tsx` — one new `<Suspense>` block.
9. Component smoke tests.
10. Manual QA with the seeded demo data + empty-state check by clearing demo data.
