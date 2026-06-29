# Dashboard Analytics — Design Spec

- **Date:** 2026-06-29
- **Scope:** `react-data-dashboard/dashboard` (Next.js 15 + React 19 + Prisma 7 + Postgres + Tailwind 4)
- **Status:** Approved design, ready for implementation planning

## 1. Goals

Replace the current static, seed-based dashboard with a real analytics system backed by transactional store data.

The dashboard must:

1. Store revenue/orders/inventory/customer data in a schema that is easy to join and aggregate, not pre-computed per-product columns.
2. Process raw data into KPI aggregates dynamically by **daily / weekly / monthly** timeframes (and arbitrary `[from, to)` windows).
3. Render the result as an interactive, multi-panel dashboard with KPI tiles, charts, tables, and period-over-period trend indicators.

## 2. Non-goals (Phase 1)

Explicitly excluded to keep scope tight:

- Seed / demo-data script — the user will insert data manually; every panel handles empty state.
- Funnel / visitor / conversion-rate analytics — requires a separate pageview pipeline; deferred.
- Real-time push updates (websockets / SSE) — data refreshes on navigation and on `revalidateTag('analytics')`.
- Custom date-range picker UI — preset `daily / weekly / monthly` only; the `from`/`to` URL contract is reserved for a later step.
- CSV / PDF export.
- Server-side pagination on Top Products / Top Customers — client-side limit (10–25) is enough.

## 3. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Data fidelity | Full transactional model (Orders, OrderItems, InventoryMovement, Customer) |
| 2 | KPIs included | Revenue/orders/AOV, top products, inventory, store comparison, customers, categories, period-over-period trends |
| 3 | Funnel data | Deferred |
| 4 | Aggregation | On-the-fly SQL (`date_trunc` + `GROUP BY` via `$queryRaw`) |
| 5 | Seed data | None — handle empty states everywhere |
| 6 | Chart library | Recharts |
| 7 | Currency | Multi-currency with `FxRate` table |
| 8 | Customer model | Full `Customer` entity (id, email, firstOrderAt, …) |
| 9 | Refunds | `Order.status` enum (PENDING/PAID/REFUNDED/CANCELLED); revenue counts only `PAID` |
| 10 | Inventory model | `InventoryMovement` ledger; on-hand = `SUM(delta)` |
| 11 | Dashboard layout | Single rich `/dashboard` page with KPI row → main chart → store + category → products + inventory → customer panels |
| 12 | Interactivity model | Search-param-driven RSC; each panel in its own `<Suspense>` |

## 4. Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                  app/dashboard/page.tsx (RSC)                    │
│      reads search params: ?range=daily|weekly|monthly            │
│                 &storeId=...&currency=USD                        │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │ <Suspense>   │  │ <Suspense>     │  │ <Suspense>          │ │
│  │  KpiTiles    │  │  RevenueChart  │  │  TopProductsTable   │ │
│  └──────────────┘  └────────────────┘  └─────────────────────┘ │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │ StoreCompare │  │ Inventory      │  │ CustomerInsights    │ │
│  │              │  │  Alerts        │  │                     │ │
│  └──────────────┘  └────────────────┘  └─────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │     lib/analytics/*         │  pure async fns,
              │  (revenue, products,        │  return typed
              │   inventory, customers,     │  aggregates
              │   stores, categories)       │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │    lib/repository/*         │  Prisma queries,
              │ (raw read functions,        │  no business logic,
              │  scoped by ownerId/storeId) │  ownerId enforcement
              └──────────────┬──────────────┘
                             │
                       Prisma + Postgres
```

### 4.1 Boundary contract

- `lib/repository/*` — typed wrappers over Prisma. No timeframe math, no aggregation logic. Every read takes `ownerId` and enforces it.
- `lib/analytics/*` — one file per KPI domain. Functions take `AnalyticsScope` and return Recharts-ready DTOs. Use `date_trunc` via `prisma.$queryRaw` for time bucketing.
- `app/dashboard/page.tsx` — reads/validates `searchParams`, fans out analytics calls in parallel `<Suspense>` boundaries.
- `components/dashboard/*` — presentational; client components only where interactivity is needed.

## 5. Database schema

Money is stored as integer cents (`Int`) in the order's currency; FX conversion happens at read time via `FxRate`. Revenue is **always** derived (`SUM(OrderItem.subtotalCents)` from `PAID` orders) — never a stored column on `Product` or `Store`.

```prisma
// ─────────── existing (kept) ───────────
model User {
  id        String   @id @default(uuid())
  accountId Int      @unique @default(autoincrement())
  fullName  String
  email     String   @unique
  password  String?
  googleId  String?  @unique
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  stores    Store[]
}

// ─────────── store + catalog ───────────
model Store {
  id             Int       @id @default(autoincrement())
  name           String
  location       String
  baseCurrency   String    @default("USD") // ISO-4217
  owner          User      @relation(fields: [ownerId], references: [accountId])
  ownerId        Int
  products       Product[]
  orders         Order[]
  inventory      InventoryMovement[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([ownerId])
}

model Category {
  id        Int       @id @default(autoincrement())
  name      String    @unique
  products  Product[]
}

model Product {
  id             Int                 @id @default(autoincrement())
  sku            String              @unique
  name           String
  category       Category            @relation(fields: [categoryId], references: [id])
  categoryId     Int
  store          Store               @relation(fields: [storeId], references: [id])
  storeId        Int
  unitPriceCents Int                  // list price in store.baseCurrency
  reorderPoint   Int                  @default(0) // low-stock threshold
  orderItems     OrderItem[]
  movements      InventoryMovement[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([storeId])
  @@index([categoryId])
}

// ─────────── customers ───────────
model Customer {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  fullName     String?
  firstOrderAt DateTime?  // set by app code on the first transition of any of this customer's orders to PAID
  orders       Order[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

// ─────────── orders ───────────
enum OrderStatus {
  PENDING
  PAID
  REFUNDED
  CANCELLED
}

model Order {
  id          Int          @id @default(autoincrement())
  store       Store        @relation(fields: [storeId], references: [id])
  storeId     Int
  customer    Customer?    @relation(fields: [customerId], references: [id])
  customerId  Int?
  status      OrderStatus  @default(PENDING)
  currency    String       // ISO-4217; copy of store.baseCurrency at order time
  totalCents  Int          // SUM(items.subtotalCents); denormalized for fast filters
  placedAt    DateTime     @default(now())   // business timestamp; analytics keys on this
  paidAt      DateTime?
  refundedAt  DateTime?
  items       OrderItem[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([storeId, status, placedAt])        // primary analytics index
  @@index([customerId])
  @@index([placedAt])
}

model OrderItem {
  id             Int      @id @default(autoincrement())
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId        Int
  product        Product  @relation(fields: [productId], references: [id])
  productId      Int
  quantity       Int
  unitPriceCents Int       // snapshot at sale time
  subtotalCents  Int       // = quantity * unitPriceCents
  createdAt      DateTime @default(now())

  @@index([orderId])
  @@index([productId])
}

// ─────────── inventory ledger ───────────
enum InventoryReason {
  PURCHASE   // stock incoming
  SALE       // -qty when order paid
  ADJUSTMENT // manual correction
  RETURN     // +qty on refund
}

model InventoryMovement {
  id         Int             @id @default(autoincrement())
  store      Store           @relation(fields: [storeId], references: [id])
  storeId    Int
  product    Product         @relation(fields: [productId], references: [id])
  productId  Int
  delta      Int              // signed: +incoming / -outgoing
  reason     InventoryReason
  orderId    Int?             // optional link to triggering order
  note       String?
  occurredAt DateTime         @default(now())

  @@index([storeId, productId, occurredAt])
  @@index([occurredAt])
}

// ─────────── multi-currency ───────────
model FxRate {
  id            Int      @id @default(autoincrement())
  baseCurrency  String   // e.g. "USD"
  quoteCurrency String   // e.g. "EUR"
  rate          Decimal  @db.Decimal(18, 8)  // baseCurrency * rate = quoteCurrency
  asOf          DateTime
  createdAt     DateTime @default(now())

  @@unique([baseCurrency, quoteCurrency, asOf])
  @@index([baseCurrency, quoteCurrency, asOf])
}
```

### 5.1 Query → join cheat sheet

| KPI | Join path |
|---|---|
| Revenue by day | `Order WHERE status=PAID` → `date_trunc('day', placedAt)` → `SUM(totalCents)` |
| Top products | `OrderItem JOIN Order (PAID)` → `GROUP BY productId` → `SUM(subtotalCents), SUM(quantity)` |
| Category share | `OrderItem JOIN Product JOIN Category` → `GROUP BY category.name` |
| New vs returning | `Order JOIN Customer` → compare `customer.firstOrderAt` with order's `placedAt` |
| Low stock | `InventoryMovement GROUP BY (storeId, productId)` → `HAVING SUM(delta) <= product.reorderPoint` |
| Period-over-period | Two passes: `[from, to)` and `[from − Δ, from)` |

## 6. Analytics module

### 6.1 Shared types

```ts
// lib/analytics/types.ts
export type Range = "daily" | "weekly" | "monthly";

export interface AnalyticsScope {
  ownerId: number;       // from session — REQUIRED, enforced server-side
  storeId?: number;      // optional filter; undefined = all stores user owns
  from: Date;            // inclusive
  to: Date;              // exclusive
  currency: string;      // display currency, e.g. "USD"
}

export interface TimeSeriesPoint {
  bucket: Date;          // start of day/week/month (UTC)
  label: string;         // pre-formatted axis label
  value: number;         // already FX-converted, major units
}

export interface Delta<T = number> {
  current: T;
  previous: T;
  changePct: number;     // 0 when previous = 0
  direction: "up" | "down" | "flat";
}
```

### 6.2 Layout

```text
lib/analytics/
├── types.ts              shared DTOs
├── timeframe.ts          window/bucket resolution + period-over-period
├── fx.ts                 currency conversion helper
├── revenue.ts            KPI tiles + time-series
├── products.ts           top/worst products, growth %
├── inventory.ts          on-hand, low-stock, turnover
├── customers.ts          new vs returning, top customers
├── stores.ts             per-store leaderboard
└── categories.ts         category share (donut)
```

### 6.3 Function signatures (representative)

```ts
// revenue.ts
export async function getRevenueTimeSeries(scope: AnalyticsScope, range: Range): Promise<TimeSeriesPoint[]>;
export async function getRevenueSummary(scope: AnalyticsScope): Promise<{ revenue: Delta; orders: Delta; aov: Delta }>;

// products.ts
export interface ProductRow {
  productId: number; name: string; category: string;
  revenue: number; units: number; growthPct: number;
}
export async function getTopProducts(scope: AnalyticsScope, limit?: number): Promise<ProductRow[]>;

// inventory.ts
export interface StockRow {
  productId: number; name: string; storeId: number; storeName: string;
  onHand: number; reorderPoint: number; status: "OK" | "LOW" | "OUT";
}
export async function getStockSnapshot(scope: AnalyticsScope): Promise<StockRow[]>;
export async function getLowStockAlerts(scope: AnalyticsScope): Promise<StockRow[]>;
export async function getInventoryTurnover(scope: AnalyticsScope): Promise<{ productId: number; name: string; turnover: number }[]>;

// customers.ts
export async function getCustomerMix(scope: AnalyticsScope): Promise<{ newCount: Delta; returningCount: Delta }>;
export async function getTopCustomers(scope: AnalyticsScope, limit?: number): Promise<{ customerId: number; email: string; orders: number; spend: number }[]>;

// stores.ts
export async function getStoreLeaderboard(scope: AnalyticsScope): Promise<{ storeId: number; name: string; revenue: number; orders: number; aov: number }[]>;

// categories.ts
export async function getCategoryShare(scope: AnalyticsScope): Promise<{ category: string; revenue: number; share: number /* 0..1 */ }[]>;
```

### 6.4 SQL pattern — example: revenue time series

```ts
const rows = await prisma.$queryRaw<Array<{ bucket: Date; cents: bigint; currency: string }>>`
  SELECT
    date_trunc(${bucket}, "placedAt") AT TIME ZONE 'UTC' AS bucket,
    SUM("totalCents")::bigint AS cents,
    currency
  FROM "Order"
  WHERE "storeId" = ANY(${storeIds})
    AND status = 'PAID'
    AND "placedAt" >= ${from}
    AND "placedAt" <  ${to}
  GROUP BY bucket, currency
  ORDER BY bucket ASC;
`;
```

JS then converts cents → target currency via `fx.ts`, fills missing buckets with zeros for continuous axes, and formats labels.

**Note on `${bucket}`:** because `date_trunc` requires a string literal, `bucket` is **not** a bound parameter — it is selected from a whitelist (`"day" | "week" | "month"`) and interpolated via `Prisma.sql\`...\`` to keep the query safe from injection.

### 6.5 Period-over-period

Every summary function makes two queries internally — current `[from, to)` and `[from − Δ, from)` — and returns `Delta<T>`. KPI tiles render the % change with an up/down arrow; the revenue chart can overlay the previous period as a dashed line.

### 6.6 Empty-state contract

Every analytics function returns a well-defined empty value, never `null`:

- Time series → `[]`
- Tables → `[]`
- Summaries → `{ current: 0, previous: 0, changePct: 0, direction: "flat" }`

### 6.7 Caching

Use Next.js `unstable_cache` keyed by `(ownerId, storeId, range, from, to, currency)` with `revalidateTag('analytics')`. Mutations (new order, inventory movement) call `revalidateTag('analytics')` so the dashboard reflects changes on next render.

## 7. UI structure

### 7.1 Page layout

```text
┌────────────────────────────────────────────────────────────────────┐
│  Header                                                            │
│    "Dashboard"   subtitle      [Store ▾]  [Currency ▾]  [Range ▾] │
├────────────────────────────────────────────────────────────────────┤
│  Row 1 — KPI tiles (Revenue / Orders / AOV / Customers)            │
├────────────────────────────────────────────────────────────────────┤
│  Row 2 — Revenue trend (ComposedChart: area + bar + prev period)   │
├────────────────────────────────────────────────────────────────────┤
│  Row 3 — Store leaderboard (h-bar) | Category share (donut)        │
├────────────────────────────────────────────────────────────────────┤
│  Row 4 — Top products table       | Inventory alerts               │
├────────────────────────────────────────────────────────────────────┤
│  Row 5 — New vs returning (stacked bar) | Top customers table      │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 URL search-param contract

| Param | Type | Default | Notes |
|---|---|---|---|
| `range` | `daily \| weekly \| monthly` | `daily` | drives bucket + default window |
| `from`, `to` | ISO date | derived from `range` | reserved; not exposed in UI in Phase 1 |
| `storeId` | int | unset (= all owned stores) | scope filter |
| `currency` | ISO-4217 | first store's `baseCurrency` | display currency |

Validated via Zod (`dashboardSearchSchema`). Invalid values silently fall back to defaults.

### 7.3 Component tree

```text
components/dashboard/
├── filters/
│   ├── DashboardFilters.tsx       client: orchestrator
│   ├── RangeSelector.tsx          client: daily | weekly | monthly pills
│   ├── StoreSelector.tsx          client: dropdown of user's stores
│   └── CurrencySelector.tsx       client: dropdown of supported currencies
├── kpi/
│   ├── KpiTile.tsx                server: title, value, delta chip
│   └── KpiRow.tsx                 server: fans out KPI fetches
├── charts/
│   ├── RevenueTrendChart.tsx      client: Recharts ComposedChart
│   ├── StoreLeaderboardChart.tsx  client: Recharts BarChart (horizontal)
│   ├── CategoryShareChart.tsx     client: Recharts PieChart (donut)
│   └── NewVsReturningChart.tsx    client: Recharts BarChart (stacked)
├── tables/
│   ├── TopProductsTable.tsx       client: sortable
│   └── TopCustomersTable.tsx      server
├── inventory/
│   └── InventoryAlertsPanel.tsx   server
├── shared/
│   ├── PanelCard.tsx
│   ├── EmptyState.tsx
│   └── ChartSkeleton.tsx          used as <Suspense fallback>
```

Server vs client: `"use client"` only when there is interactivity (Recharts tooltips, sorting, dropdowns).

### 7.4 Filter interaction model

```text
User clicks "Weekly"
  → RangeSelector calls router.push("/dashboard?range=weekly&storeId=2")
  → Next.js soft-navigates; RSC re-renders
  → Each <Suspense> panel streams new data as analytics queries finish
```

No `useEffect`, no client fetch, no manual loading-state plumbing.

### 7.5 Empty states

Every panel has three modes:

1. **Loading** → `<ChartSkeleton />` via `<Suspense fallback>`.
2. **Empty** → `<EmptyState>` with a panel-specific message (e.g., revenue chart: *"No paid orders in this period."*; inventory: positive empty state *"All inventory is healthy."*).
3. **Populated** → real chart/table.

KPI tiles render `—` in empty mode (not `0`) and hide the delta chip.

### 7.6 Style

- Reuse current Tailwind palette (slate + indigo + emerald accent).
- KPI tiles: `rounded-2xl border bg-white shadow-sm`, large numeric value, delta chip (emerald-50 / rose-50).
- Recharts: muted gridlines; revenue indigo, orders emerald, conversion-style amber.
- Mobile: KPI row → 2-up; other rows stack.

### 7.7 Accessibility

- Real `<select>` / `<button>` filters with labels.
- Charts: `role="img"` + `aria-label` summary ("Revenue trend, weekly, current $12.4k up 8.2%").
- Tables: `<table>` semantics with `<th scope="col">`.
- Tiles announce delta direction via color + icon + `sr-only` text.

## 8. Error handling

1. `app/dashboard/error.tsx` — catches anything thrown by the RSC tree; renders a retry card.
2. Per-panel `<ErrorBoundary>` — one failing panel doesn't take down the page.
3. Typed errors — `AnalyticsError { code: "FX_MISSING" | "DB_UNAVAILABLE" | "INVALID_RANGE" }`; panel boundaries map known codes to friendly messages.
4. Input validation — Zod schema for `searchParams`; invalid values fall back to defaults.
5. Auth scoping — every analytics function takes `ownerId` from the session; the repository layer enforces `Store.ownerId = ownerId`. Tampering with `?storeId=` cannot leak another user's data.
6. FX missing — if `orderCurrency === targetCurrency`, skip conversion. Otherwise use the most recent available rate; if none exists, exclude that order and surface a non-blocking banner rendered just below the dashboard header (`components/dashboard/shared/FxWarningBanner.tsx`).

## 9. Testing

Three layers, all in `vitest` (already configured):

1. **Pure unit tests** — `timeframe.ts` (windows, DST edges, custom ranges), `fx.ts` (conversion math, missing-rate fallback, identity case), empty-state helpers.
2. **Analytics integration tests** — DB-backed via `@prisma/adapter-better-sqlite3` (already a dep). One file per analytics module; seed minimal fixtures, assert returned DTOs. Cover: `PAID`-only filter, period-over-period math, multi-store scoping, `ownerId` isolation, empty DB.
3. **Component smoke tests** — Vitest + React Testing Library. KPI tiles render value/delta. `EmptyState` rendered when given `[]`. Filters push expected search params.

E2E (Playwright) — deferred.

## 10. Migration plan

1. **Migration 1** (`add_analytics_tables`): create `Category`, `Customer`, `Order`, `OrderItem`, `InventoryMovement`, `FxRate`. Add new columns to `Product` (`sku`, `categoryId`, `unitPriceCents`, `reorderPoint`) as nullable.
2. **Migration 2** (`drop_legacy_product_columns`): drop `Product.revenue`, `Product.orders`, `Product.growth`; make new required columns `NOT NULL`.
3. Update `lib/repository/products.ts` to expose the new shape; remove dead helpers.

Because no seed data is in scope, no backfill script is needed — the migration is a single non-destructive forward step (existing demo product rows lose their revenue/orders/growth columns; that is acceptable).

## 11. Implementation order (rough — for the plan)

The detailed implementation plan is a separate document, but the dependency order is:

1. Schema migration + Prisma client regen.
2. `lib/analytics/types.ts`, `timeframe.ts`, `fx.ts` (foundation).
3. `lib/repository/*` updates (ownerId-scoped reads).
4. Analytics modules — `revenue` → `products` → `categories` → `stores` → `inventory` → `customers`.
5. Recharts install + `components/dashboard/shared/*` (PanelCard, EmptyState, ChartSkeleton).
6. KPI tiles + filters (URL search-param plumbing).
7. Charts (Revenue, Store leaderboard, Category donut, New vs returning).
8. Tables (Top products, Top customers) + Inventory alerts.
9. `app/dashboard/page.tsx` wiring, Suspense boundaries, error boundary.
10. Tests at each layer.
