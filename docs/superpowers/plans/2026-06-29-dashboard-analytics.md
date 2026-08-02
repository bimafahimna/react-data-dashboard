# Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static, seed-based dashboard with a real analytics system: transactional Postgres schema, on-the-fly SQL aggregations bucketed by daily / weekly / monthly, and a multi-panel interactive Recharts dashboard with empty-state handling.

**Architecture:** Server Components in `app/dashboard/page.tsx` read URL search params (`range`, `storeId`, `currency`), call typed analytics functions in `lib/analytics/*`, and pass results into Recharts client components wrapped in per-panel `<Suspense>` boundaries. Analytics queries use `prisma.$queryRaw` with `date_trunc` for time bucketing and `groupBy` for category/store rollups. Ownership scoping (`Store.ownerId = session.accountId`) is enforced in the repository layer.

**Tech Stack:** Next.js 15 (App Router) · React 19 · Prisma 7 + Postgres 16 · Tailwind 4 · Recharts · Zod · Vitest + React Testing Library.

**Spec:** [`docs/superpowers/specs/2026-06-29-dashboard-analytics-design.md`](../specs/2026-06-29-dashboard-analytics-design.md)

**Working directory for all commands:** `react-data-dashboard/dashboard/`

---

## File Structure

### New files (created in this plan)

```
prisma/
  migrations/<ts>_dashboard_analytics_schema/migration.sql      auto-generated
lib/
  analytics/
    types.ts                shared DTOs (Range, AnalyticsScope, TimeSeriesPoint, Delta)
    timeframe.ts            window/bucket resolution + period-over-period
    fx.ts                   currency conversion helper
    revenue.ts              getRevenueTimeSeries, getRevenueSummary
    products.ts             getTopProducts
    categories.ts           getCategoryShare
    stores.ts               getStoreLeaderboard
    inventory.ts            getStockSnapshot, getLowStockAlerts, getInventoryTurnover
    customers.ts            getCustomerMix, getTopCustomers
    __tests__/
      timeframe.test.ts
      fx.test.ts
  dashboard/
    search-params.ts        Zod schema for ?range/?storeId/?currency/?from/?to
    __tests__/
      search-params.test.ts
  session-helpers.ts        requireAccountId() helper
components/dashboard/
  shared/
    PanelCard.tsx
    EmptyState.tsx
    ChartSkeleton.tsx
    FxWarningBanner.tsx
  filters/
    DashboardFilters.tsx
    RangeSelector.tsx
    StoreSelector.tsx
    CurrencySelector.tsx
  kpi/
    KpiTile.tsx
    KpiRow.tsx
    formatDelta.ts          pure helper used by KpiTile
    __tests__/
      formatDelta.test.ts
      KpiTile.test.tsx
  charts/
    RevenueTrendChart.tsx
    StoreLeaderboardChart.tsx
    CategoryShareChart.tsx
    NewVsReturningChart.tsx
  tables/
    TopProductsTable.tsx
    TopCustomersTable.tsx
  inventory/
    InventoryAlertsPanel.tsx
app/dashboard/
  error.tsx
```

### Modified files

```
prisma/schema.prisma                                rewritten (see Task 2)
lib/repository/stores.ts                            scoped by ownerId, returns baseCurrency
lib/repository/products.ts                          new shape (sku, categoryId, unitPriceCents)
app/dashboard/page.tsx                              rewritten as Suspense-wrapped panels
package.json                                        adds recharts, jsdom, testing-library
vitest.config.ts                                    env per-file via inline directives (no change needed)
```

### Deleted files (legacy)

```
components/dashboard/TimeframeChart.tsx
components/dashboard/ProductCard.tsx
components/dashboard/ProductCards.tsx
```

---

## Phase 0 — Prerequisites (one-time)

- [ ] **Step 0.1:** Confirm Postgres is running: `docker compose up -d db` (from `dashboard/`). Verify `psql $DATABASE_URL -c "select 1;"` succeeds.
- [ ] **Step 0.2:** Confirm tests run on a fresh checkout: `npm run test:run`. Expected: passes or no tests found.

---

## Task 1: Install runtime + test dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1:** Install Recharts (charts) and testing-library packages:

```bash
npm install recharts
npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 1.2:** Verify `recharts` appears under `dependencies` and the three `@testing-library/*` packages plus `jsdom` appear under `devDependencies` in `package.json`.

- [ ] **Step 1.3:** Commit:

```bash
git add package.json package-lock.json
git commit -m "feat(dashboard): add recharts and testing-library deps"
```

---

## Task 2: Rewrite Prisma schema (analytics tables)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 2.1:** Replace the entire body of `prisma/schema.prisma` (preserve the `generator client` and `datasource db` blocks at the top) with:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

model Store {
  id           Int                 @id @default(autoincrement())
  name         String
  location     String
  baseCurrency String              @default("USD")
  owner        User                @relation(fields: [ownerId], references: [accountId])
  ownerId      Int
  products     Product[]
  orders       Order[]
  inventory    InventoryMovement[]
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  @@index([ownerId])
}

model Category {
  id       Int       @id @default(autoincrement())
  name     String    @unique
  products Product[]
}

model Product {
  id             Int                 @id @default(autoincrement())
  sku            String              @unique
  name           String
  category       Category            @relation(fields: [categoryId], references: [id])
  categoryId     Int
  store          Store               @relation(fields: [storeId], references: [id])
  storeId        Int
  unitPriceCents Int
  reorderPoint   Int                 @default(0)
  orderItems     OrderItem[]
  movements      InventoryMovement[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([storeId])
  @@index([categoryId])
}

model Customer {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  fullName     String?
  firstOrderAt DateTime?
  orders       Order[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

enum OrderStatus {
  PENDING
  PAID
  REFUNDED
  CANCELLED
}

model Order {
  id         Int         @id @default(autoincrement())
  store      Store       @relation(fields: [storeId], references: [id])
  storeId    Int
  customer   Customer?   @relation(fields: [customerId], references: [id])
  customerId Int?
  status     OrderStatus @default(PENDING)
  currency   String
  totalCents Int
  placedAt   DateTime    @default(now())
  paidAt     DateTime?
  refundedAt DateTime?
  items      OrderItem[]
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@index([storeId, status, placedAt])
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
  unitPriceCents Int
  subtotalCents  Int
  createdAt      DateTime @default(now())

  @@index([orderId])
  @@index([productId])
}

enum InventoryReason {
  PURCHASE
  SALE
  ADJUSTMENT
  RETURN
}

model InventoryMovement {
  id         Int             @id @default(autoincrement())
  store      Store           @relation(fields: [storeId], references: [id])
  storeId    Int
  product    Product         @relation(fields: [productId], references: [id])
  productId  Int
  delta      Int
  reason     InventoryReason
  orderId    Int?
  note       String?
  occurredAt DateTime        @default(now())

  @@index([storeId, productId, occurredAt])
  @@index([occurredAt])
}

model FxRate {
  id            Int      @id @default(autoincrement())
  baseCurrency  String
  quoteCurrency String
  rate          Decimal  @db.Decimal(18, 8)
  asOf          DateTime
  createdAt     DateTime @default(now())

  @@unique([baseCurrency, quoteCurrency, asOf])
  @@index([baseCurrency, quoteCurrency, asOf])
}
```

> Note: the existing `Product { revenue, orders, growth }` columns are removed in this single migration. Per the spec, no backfill is performed (the user inserts data manually).

- [ ] **Step 2.2:** Generate the migration and apply:

```bash
npx prisma migrate dev --name dashboard_analytics_schema
```

Expected: a new directory `prisma/migrations/<ts>_dashboard_analytics_schema/` with `migration.sql` that drops `Product.revenue/orders/growth`, adds `sku/categoryId/unitPriceCents/reorderPoint`, and creates the new tables (`Category`, `Customer`, `Order`, `OrderItem`, `InventoryMovement`, `FxRate`) plus their indexes. Prisma client is regenerated into `generated/prisma/`.

- [ ] **Step 2.3:** Verify the generated SQL is sane:

```bash
cat prisma/migrations/*dashboard_analytics_schema*/migration.sql | head -60
```

Expected: drops of `revenue`, `orders`, `growth` columns visible; `CREATE TABLE "Order"`, `"OrderItem"`, etc. present.

- [ ] **Step 2.4:** Commit:

```bash
git add prisma/schema.prisma prisma/migrations generated
git commit -m "feat(dashboard): replace product aggregate columns with transactional schema"
```

---

## Task 3: Shared analytics types

**Files:**
- Create: `lib/analytics/types.ts`

- [ ] **Step 3.1:** Create `lib/analytics/types.ts`:

```ts
export type Range = "daily" | "weekly" | "monthly";
export type Bucket = "day" | "week" | "month";

export interface AnalyticsScope {
  ownerId: number;
  storeId?: number;
  from: Date;
  to: Date;
  currency: string;
}

export interface TimeSeriesPoint {
  bucket: Date;
  label: string;
  value: number;
}

export type Direction = "up" | "down" | "flat";

export interface Delta<T = number> {
  current: T;
  previous: T;
  changePct: number;
  direction: Direction;
}

export const RANGE_TO_BUCKET: Record<Range, Bucket> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

export class AnalyticsError extends Error {
  constructor(public code: "FX_MISSING" | "DB_UNAVAILABLE" | "INVALID_RANGE", message: string) {
    super(message);
    this.name = "AnalyticsError";
  }
}
```

- [ ] **Step 3.2:** Type-check:

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/analytics/types.ts`.

- [ ] **Step 3.3:** Commit:

```bash
git add lib/analytics/types.ts
git commit -m "feat(analytics): add shared types (AnalyticsScope, Delta, TimeSeriesPoint)"
```

---

## Task 4: Timeframe resolver (TDD)

**Files:**
- Create: `lib/analytics/timeframe.ts`
- Create: `lib/analytics/__tests__/timeframe.test.ts`

- [ ] **Step 4.1: Write the failing tests:**

```ts
// lib/analytics/__tests__/timeframe.test.ts
import { describe, it, expect } from "vitest";
import { resolveWindow, buildDelta } from "../timeframe";

describe("resolveWindow", () => {
  const now = new Date(Date.UTC(2026, 5, 29, 12, 0, 0)); // Mon Jun 29 2026 12:00 UTC

  it("daily: returns last 7 days [from, to) ending at start-of-tomorrow UTC", () => {
    const w = resolveWindow("daily", undefined, undefined, now);
    expect(w.bucket).toBe("day");
    expect(w.to.toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-06-23T00:00:00.000Z");
    expect(w.previousFrom.toISOString()).toBe("2026-06-16T00:00:00.000Z");
    expect(w.previousTo.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });

  it("weekly: returns last 8 weeks ending on next Monday UTC", () => {
    const w = resolveWindow("weekly", undefined, undefined, now);
    expect(w.bucket).toBe("week");
    expect(w.to.toISOString()).toBe("2026-07-06T00:00:00.000Z"); // next Monday after Jun 29
    expect(w.from.toISOString()).toBe("2026-05-11T00:00:00.000Z"); // 8 weeks earlier
  });

  it("monthly: returns last 6 months ending at start of next month UTC", () => {
    const w = resolveWindow("monthly", undefined, undefined, now);
    expect(w.bucket).toBe("month");
    expect(w.to.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("respects explicit from/to and computes equal-length previous window", () => {
    const w = resolveWindow(
      "daily",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
      now,
    );
    expect(w.from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(w.previousTo.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(w.previousFrom.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("ignores malformed from/to and falls back to range default", () => {
    const w = resolveWindow("daily", "not-a-date", "also-bad", now);
    expect(w.from.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
});

describe("buildDelta", () => {
  it("computes percentage change and direction", () => {
    expect(buildDelta(120, 100)).toEqual({
      current: 120, previous: 100, changePct: 20, direction: "up",
    });
    expect(buildDelta(80, 100)).toEqual({
      current: 80, previous: 100, changePct: -20, direction: "down",
    });
  });
  it("returns flat with 0% when previous is 0", () => {
    expect(buildDelta(50, 0)).toEqual({
      current: 50, previous: 0, changePct: 0, direction: "flat",
    });
  });
  it("returns flat when current equals previous", () => {
    expect(buildDelta(100, 100).direction).toBe("flat");
  });
});
```

- [ ] **Step 4.2: Run and verify FAIL:**

```bash
npx vitest run lib/analytics/__tests__/timeframe.test.ts
```

Expected: fails with "Cannot find module '../timeframe'".

- [ ] **Step 4.3: Implement** `lib/analytics/timeframe.ts`:

```ts
import { Bucket, Delta, Range, RANGE_TO_BUCKET, Direction } from "./types";

export interface ResolvedWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: Bucket;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcWeekMonday(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay(); // 0 = Sunday
  const deltaDays = dow === 0 ? 6 : dow - 1;
  return new Date(day.getTime() - deltaDays * DAY_MS);
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function parseIso(input: string | undefined): Date | null {
  if (!input) return null;
  const t = Date.parse(input);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function resolveWindow(
  range: Range,
  fromParam: string | undefined,
  toParam: string | undefined,
  now: Date = new Date(),
): ResolvedWindow {
  const bucket = RANGE_TO_BUCKET[range];

  const explicitFrom = parseIso(fromParam);
  const explicitTo = parseIso(toParam);
  if (explicitFrom && explicitTo && explicitTo > explicitFrom) {
    const span = explicitTo.getTime() - explicitFrom.getTime();
    return {
      bucket,
      from: explicitFrom,
      to: explicitTo,
      previousFrom: new Date(explicitFrom.getTime() - span),
      previousTo: explicitFrom,
    };
  }

  let to: Date;
  let from: Date;
  if (range === "daily") {
    to = new Date(startOfUtcDay(now).getTime() + DAY_MS);
    from = new Date(to.getTime() - 7 * DAY_MS);
  } else if (range === "weekly") {
    to = new Date(startOfUtcWeekMonday(now).getTime() + 7 * DAY_MS);
    from = new Date(to.getTime() - 8 * 7 * DAY_MS);
  } else {
    const m = startOfUtcMonth(now);
    to = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    from = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 5, 1));
  }
  const span = to.getTime() - from.getTime();
  return {
    bucket,
    from,
    to,
    previousFrom: new Date(from.getTime() - span),
    previousTo: from,
  };
}

export function buildDelta(current: number, previous: number): Delta {
  if (previous === 0 || current === previous) {
    return {
      current,
      previous,
      changePct: 0,
      direction: "flat" as Direction,
    };
  }
  const changePct = ((current - previous) / previous) * 100;
  return {
    current,
    previous,
    changePct,
    direction: changePct > 0 ? "up" : "down",
  };
}
```

- [ ] **Step 4.4: Run and verify PASS:**

```bash
npx vitest run lib/analytics/__tests__/timeframe.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 4.5: Commit:**

```bash
git add lib/analytics/timeframe.ts lib/analytics/__tests__/timeframe.test.ts
git commit -m "feat(analytics): add timeframe resolver with period-over-period support"
```

---

## Task 5: FX conversion helper (TDD)

**Files:**
- Create: `lib/analytics/fx.ts`
- Create: `lib/analytics/__tests__/fx.test.ts`

- [ ] **Step 5.1: Write the failing tests** (using a mocked rate fetcher to avoid DB in unit tests):

```ts
// lib/analytics/__tests__/fx.test.ts
import { describe, it, expect } from "vitest";
import { convertCentsWithRates, type FxRateLookup } from "../fx";

const rates: FxRateLookup[] = [
  { baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.9, asOf: new Date("2026-06-01") },
  { baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.92, asOf: new Date("2026-06-20") },
];

describe("convertCentsWithRates", () => {
  it("returns major units unchanged when source equals target", () => {
    expect(convertCentsWithRates(12345, "USD", "USD", new Date("2026-06-15"), rates))
      .toBeCloseTo(123.45, 2);
  });

  it("uses most-recent rate at-or-before asOf", () => {
    const out = convertCentsWithRates(10000, "USD", "EUR", new Date("2026-06-15"), rates);
    expect(out).toBeCloseTo(90, 2); // 100 USD * 0.9
  });

  it("picks newer rate when asOf is after it", () => {
    const out = convertCentsWithRates(10000, "USD", "EUR", new Date("2026-06-25"), rates);
    expect(out).toBeCloseTo(92, 2);
  });

  it("throws AnalyticsError(FX_MISSING) when no rate exists", () => {
    expect(() =>
      convertCentsWithRates(10000, "USD", "JPY", new Date("2026-06-15"), rates),
    ).toThrow(/FX_MISSING/);
  });

  it("throws when only newer rates exist (no rate at or before asOf)", () => {
    expect(() =>
      convertCentsWithRates(10000, "USD", "EUR", new Date("2026-05-01"), rates),
    ).toThrow(/FX_MISSING/);
  });
});
```

- [ ] **Step 5.2: Run and verify FAIL:**

```bash
npx vitest run lib/analytics/__tests__/fx.test.ts
```

Expected: fails with module not found.

- [ ] **Step 5.3: Implement** `lib/analytics/fx.ts`:

```ts
import { prisma } from "../prisma";
import { AnalyticsError } from "./types";

export interface FxRateLookup {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number; // major-unit-per-major-unit
  asOf: Date;
}

export function convertCentsWithRates(
  cents: number,
  sourceCurrency: string,
  targetCurrency: string,
  asOf: Date,
  rates: FxRateLookup[],
): number {
  const major = cents / 100;
  if (sourceCurrency === targetCurrency) return major;

  const candidates = rates
    .filter(
      (r) =>
        r.baseCurrency === sourceCurrency &&
        r.quoteCurrency === targetCurrency &&
        r.asOf.getTime() <= asOf.getTime(),
    )
    .sort((a, b) => b.asOf.getTime() - a.asOf.getTime());

  if (candidates.length === 0) {
    throw new AnalyticsError(
      "FX_MISSING",
      `No FX rate for ${sourceCurrency}->${targetCurrency} at or before ${asOf.toISOString()}`,
    );
  }
  return major * candidates[0].rate;
}

/**
 * Loads all FxRate rows needed to convert any of the given source currencies into `target`.
 * Cheap to over-fetch — there are few currencies and the table is small.
 */
export async function loadFxRates(
  sourceCurrencies: string[],
  target: string,
): Promise<FxRateLookup[]> {
  const sources = Array.from(new Set(sourceCurrencies.filter((c) => c !== target)));
  if (sources.length === 0) return [];
  const rows = await prisma.fxRate.findMany({
    where: { baseCurrency: { in: sources }, quoteCurrency: target },
    orderBy: { asOf: "asc" },
  });
  return rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
}
```

- [ ] **Step 5.4: Run and verify PASS:**

```bash
npx vitest run lib/analytics/__tests__/fx.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5.5: Commit:**

```bash
git add lib/analytics/fx.ts lib/analytics/__tests__/fx.test.ts
git commit -m "feat(analytics): add fx conversion helper with missing-rate error"
```

---

## Task 6: Session helper + URL search-param validator

**Files:**
- Create: `lib/session-helpers.ts`
- Create: `lib/dashboard/search-params.ts`
- Create: `lib/dashboard/__tests__/search-params.test.ts`

> **Note on currency default:** `currency` is intentionally `optional()` here so the page can fall back to the user's first store's `baseCurrency` when the URL doesn't specify one. Defaulting to `"USD"` in the schema would always override store-specific currencies.

- [ ] **Step 6.1:** Create `lib/session-helpers.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { getAccessToken } from "./session";

/** Returns the current user's accountId, or redirects to login. */
export async function requireAccountId(): Promise<number> {
  const session = await getAccessToken();
  if (!session) redirect("/login");
  return session.accountId;
}
```

- [ ] **Step 6.2: Write the failing search-params tests:**

```ts
// lib/dashboard/__tests__/search-params.test.ts
import { describe, it, expect } from "vitest";
import { parseDashboardSearchParams } from "../search-params";

describe("parseDashboardSearchParams", () => {
  it("returns defaults for empty input", () => {
    const p = parseDashboardSearchParams({});
    expect(p.range).toBe("daily");
    expect(p.storeId).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.from).toBeUndefined();
    expect(p.to).toBeUndefined();
  });

  it("accepts valid range / storeId / currency", () => {
    const p = parseDashboardSearchParams({
      range: "monthly",
      storeId: "42",
      currency: "eur",
    });
    expect(p.range).toBe("monthly");
    expect(p.storeId).toBe(42);
    expect(p.currency).toBe("EUR");
  });

  it("falls back to defaults on invalid values", () => {
    const p = parseDashboardSearchParams({
      range: "yearly",
      storeId: "abc",
      currency: "DOLLARS",
    });
    expect(p.range).toBe("daily");
    expect(p.storeId).toBeUndefined();
    expect(p.currency).toBeUndefined();
  });

  it("supports array-shaped query values (Next.js searchParams)", () => {
    const p = parseDashboardSearchParams({ range: ["weekly", "daily"] });
    expect(p.range).toBe("weekly");
  });
});
```

- [ ] **Step 6.3: Run and verify FAIL:**

```bash
npx vitest run lib/dashboard/__tests__/search-params.test.ts
```

Expected: fail (module missing).

- [ ] **Step 6.4: Implement** `lib/dashboard/search-params.ts`:

```ts
import { z } from "zod";
import type { Range } from "../analytics/types";

const RANGE_VALUES = ["daily", "weekly", "monthly"] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const schema = z.object({
  range: z
    .preprocess(first, z.enum(RANGE_VALUES))
    .catch("daily"),
  storeId: z
    .preprocess(first, z.coerce.number().int().positive())
    .optional()
    .catch(undefined),
  currency: z
    .preprocess((v) => {
      const s = first(v);
      return typeof s === "string" ? s.toUpperCase() : s;
    }, z.string().regex(/^[A-Z]{3}$/))
    .optional()
    .catch(undefined),
  from: z.preprocess(first, z.string()).optional().catch(undefined),
  to: z.preprocess(first, z.string()).optional().catch(undefined),
});

export interface DashboardSearchParams {
  range: Range;
  storeId?: number;
  currency?: string;
  from?: string;
  to?: string;
}

export function parseDashboardSearchParams(
  input: Record<string, string | string[] | undefined>,
): DashboardSearchParams {
  return schema.parse(input) as DashboardSearchParams;
}
```

- [ ] **Step 6.5: Run and verify PASS:**

```bash
npx vitest run lib/dashboard/__tests__/search-params.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6.6: Commit:**

```bash
git add lib/session-helpers.ts lib/dashboard/search-params.ts lib/dashboard/__tests__/search-params.test.ts
git commit -m "feat(dashboard): add session helper and search-params validator"
```

---

## Task 7: Update `lib/repository/stores.ts` (ownerId scoping + baseCurrency)

**Files:**
- Modify: `lib/repository/stores.ts`

- [ ] **Step 7.1:** Replace contents of `lib/repository/stores.ts`:

```ts
"use server";

import { prisma } from "../prisma";

export interface Store {
  id: number;
  name: string;
  location: string;
  baseCurrency: string;
}

export async function getStoresForOwner(ownerId: number): Promise<Store[]> {
  const rows = await prisma.store.findMany({
    where: { ownerId },
    orderBy: { id: "asc" },
    select: { id: true, name: true, location: true, baseCurrency: true },
  });
  return rows;
}

export async function getStoreIdsForOwner(ownerId: number, storeId?: number): Promise<number[]> {
  if (storeId !== undefined) {
    const owned = await prisma.store.findFirst({
      where: { id: storeId, ownerId },
      select: { id: true },
    });
    return owned ? [owned.id] : [];
  }
  const rows = await prisma.store.findMany({ where: { ownerId }, select: { id: true } });
  return rows.map((r) => r.id);
}
```

- [ ] **Step 7.2:** Find and update existing callers:

```bash
rg "getStores\(" --type ts -l
```

Expected: hits in `app/dashboard/page.tsx` (and possibly `app/dashboard/stores/*`). These will be updated in later tasks; for now, just confirm the list. Type errors here are acceptable because the page is rewritten in Task 21.

- [ ] **Step 7.3:** Type-check (allowing errors in legacy `page.tsx`):

```bash
npx tsc --noEmit 2>&1 | grep -v "app/dashboard/page.tsx" | head -30
```

Expected: no new errors outside the legacy page.

- [ ] **Step 7.4: Commit:**

```bash
git add lib/repository/stores.ts
git commit -m "refactor(repo): scope getStores by ownerId and expose baseCurrency"
```

---

## Task 8: Update `lib/repository/products.ts` (new shape)

**Files:**
- Modify: `lib/repository/products.ts`

- [ ] **Step 8.1:** Replace contents of `lib/repository/products.ts`:

```ts
"use server";

import { prisma } from "../prisma";

export interface Product {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  categoryName: string;
  storeId: number;
  unitPriceCents: number;
  reorderPoint: number;
}

export async function getProductsByStoreId(
  storeId: number,
  ownerId: number,
): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { storeId, store: { ownerId } },
    include: { category: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    storeId: p.storeId,
    unitPriceCents: p.unitPriceCents,
    reorderPoint: p.reorderPoint,
  }));
}
```

- [ ] **Step 8.2:** Commit (callers will be fixed in Task 21):

```bash
git add lib/repository/products.ts
git commit -m "refactor(repo): expose products with new sku/category/unitPrice shape"
```

---

## Task 9: Revenue analytics module

**Files:**
- Create: `lib/analytics/revenue.ts`

> Integration tests for SQL-heavy modules are deferred; the page-level smoke check in Task 21 + manual data insertion validates the queries end-to-end. Pure helpers (`buildBuckets`, label formatting) are exercised via TypeScript and a unit test added below.

- [ ] **Step 9.1:** Create `lib/analytics/revenue.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { buildDelta } from "./timeframe";
import { AnalyticsScope, Bucket, Delta, Range, RANGE_TO_BUCKET, TimeSeriesPoint } from "./types";

interface RawRevRow {
  bucket: Date;
  cents: bigint;
  orders: bigint;
  currency: string;
}

const DAY_MS = 86_400_000;

function bucketLiteral(bucket: Bucket): Prisma.Sql {
  switch (bucket) {
    case "day": return Prisma.sql`'day'`;
    case "week": return Prisma.sql`'week'`;
    case "month": return Prisma.sql`'month'`;
  }
}

function labelFor(bucket: Bucket, d: Date): string {
  if (bucket === "month") return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (bucket === "week") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fillBuckets(rows: { bucket: Date; value: number }[], from: Date, to: Date, bucket: Bucket): { bucket: Date; value: number }[] {
  const stepMs = bucket === "day" ? DAY_MS : bucket === "week" ? 7 * DAY_MS : 0;
  const byKey = new Map(rows.map((r) => [r.bucket.toISOString(), r.value]));
  const out: { bucket: Date; value: number }[] = [];
  if (bucket === "month") {
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cur < end) {
      out.push({ bucket: cur, value: byKey.get(cur.toISOString()) ?? 0 });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  } else {
    for (let t = from.getTime(); t < to.getTime(); t += stepMs) {
      const b = new Date(t);
      out.push({ bucket: b, value: byKey.get(b.toISOString()) ?? 0 });
    }
  }
  return out;
}

async function getStoreIds(scope: AnalyticsScope): Promise<number[]> {
  if (scope.storeId !== undefined) {
    const owned = await prisma.store.findFirst({
      where: { id: scope.storeId, ownerId: scope.ownerId },
      select: { id: true },
    });
    return owned ? [owned.id] : [];
  }
  const rows = await prisma.store.findMany({
    where: { ownerId: scope.ownerId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function queryBucketed(
  storeIds: number[],
  from: Date,
  to: Date,
  bucket: Bucket,
): Promise<RawRevRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<RawRevRow[]>(Prisma.sql`
    SELECT
      date_trunc(${bucketLiteral(bucket)}, "placedAt" AT TIME ZONE 'UTC') AS bucket,
      SUM("totalCents")::bigint AS cents,
      COUNT(*)::bigint AS orders,
      currency
    FROM "Order"
    WHERE "storeId" = ANY(${storeIds})
      AND status = 'PAID'
      AND "placedAt" >= ${from}
      AND "placedAt" <  ${to}
    GROUP BY bucket, currency
    ORDER BY bucket ASC;
  `);
}

async function convertRows(rows: RawRevRow[], target: string): Promise<{ bucket: Date; value: number; orders: number }[]> {
  const currencies = Array.from(new Set(rows.map((r) => r.currency)));
  const rates = await loadFxRates(currencies, target);
  const grouped = new Map<string, { bucket: Date; value: number; orders: number }>();
  for (const r of rows) {
    let value = 0;
    try {
      value = convertCentsWithRates(Number(r.cents), r.currency, target, r.bucket, rates);
    } catch {
      continue;
    }
    const key = r.bucket.toISOString();
    const existing = grouped.get(key);
    if (existing) {
      existing.value += value;
      existing.orders += Number(r.orders);
    } else {
      grouped.set(key, { bucket: r.bucket, value, orders: Number(r.orders) });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.bucket.getTime() - b.bucket.getTime());
}

export async function getRevenueTimeSeries(scope: AnalyticsScope, range: Range): Promise<TimeSeriesPoint[]> {
  const storeIds = await getStoreIds(scope);
  const bucket = RANGE_TO_BUCKET[range];
  const rows = await queryBucketed(storeIds, scope.from, scope.to, bucket);
  const converted = await convertRows(rows, scope.currency);
  const filled = fillBuckets(
    converted.map((c) => ({ bucket: c.bucket, value: c.value })),
    scope.from,
    scope.to,
    bucket,
  );
  return filled.map((p) => ({ bucket: p.bucket, label: labelFor(bucket, p.bucket), value: p.value }));
}

export interface RevenueSummary {
  revenue: Delta;
  orders: Delta;
  aov: Delta;
}

export async function getRevenueSummary(scope: AnalyticsScope): Promise<RevenueSummary> {
  const storeIds = await getStoreIds(scope);
  const bucket = "day"; // bucket choice doesn't affect summed total
  const [currentRows, prevRows] = await Promise.all([
    queryBucketed(storeIds, scope.from, scope.to, bucket),
    queryBucketed(
      storeIds,
      new Date(scope.from.getTime() - (scope.to.getTime() - scope.from.getTime())),
      scope.from,
      bucket,
    ),
  ]);
  const [cur, prev] = await Promise.all([
    convertRows(currentRows, scope.currency),
    convertRows(prevRows, scope.currency),
  ]);

  const sum = (rows: { value: number; orders: number }[]) =>
    rows.reduce((acc, r) => ({ revenue: acc.revenue + r.value, orders: acc.orders + r.orders }), {
      revenue: 0,
      orders: 0,
    });
  const curT = sum(cur);
  const prevT = sum(prev);
  const curAov = curT.orders > 0 ? curT.revenue / curT.orders : 0;
  const prevAov = prevT.orders > 0 ? prevT.revenue / prevT.orders : 0;
  return {
    revenue: buildDelta(curT.revenue, prevT.revenue),
    orders: buildDelta(curT.orders, prevT.orders),
    aov: buildDelta(curAov, prevAov),
  };
}
```

- [ ] **Step 9.2:** Type-check:

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/analytics/revenue.ts`.

- [ ] **Step 9.3:** Commit:

```bash
git add lib/analytics/revenue.ts
git commit -m "feat(analytics): add revenue time-series and summary with period-over-period"
```

---

## Task 10: Products analytics module

**Files:**
- Create: `lib/analytics/products.ts`

- [ ] **Step 10.1:** Create `lib/analytics/products.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { AnalyticsScope } from "./types";

export interface ProductRow {
  productId: number;
  name: string;
  category: string;
  revenue: number;
  units: number;
  growthPct: number;
}

interface RawProductRow {
  productId: number;
  name: string;
  category: string;
  cents: bigint;
  units: bigint;
  currency: string;
}

async function ownedStoreIds(ownerId: number, storeId?: number): Promise<number[]> {
  if (storeId !== undefined) {
    const owned = await prisma.store.findFirst({ where: { id: storeId, ownerId }, select: { id: true } });
    return owned ? [owned.id] : [];
  }
  const rows = await prisma.store.findMany({ where: { ownerId }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function aggregateProducts(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<RawProductRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<RawProductRow[]>(Prisma.sql`
    SELECT
      p.id          AS "productId",
      p.name        AS name,
      c.name        AS category,
      SUM(oi."subtotalCents")::bigint AS cents,
      SUM(oi.quantity)::bigint        AS units,
      o.currency    AS currency
    FROM "OrderItem" oi
    JOIN "Order"   o ON o.id = oi."orderId"
    JOIN "Product" p ON p.id = oi."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to}
    GROUP BY p.id, p.name, c.name, o.currency;
  `);
}

export async function getTopProducts(scope: AnalyticsScope, limit = 10): Promise<ProductRow[]> {
  const storeIds = await ownedStoreIds(scope.ownerId, scope.storeId);
  const span = scope.to.getTime() - scope.from.getTime();
  const prevFrom = new Date(scope.from.getTime() - span);

  const [curr, prev] = await Promise.all([
    aggregateProducts(storeIds, scope.from, scope.to),
    aggregateProducts(storeIds, prevFrom, scope.from),
  ]);
  const allCurrencies = Array.from(new Set([...curr, ...prev].map((r) => r.currency)));
  const rates = await loadFxRates(allCurrencies, scope.currency);

  const reduce = (rows: RawProductRow[]) => {
    const map = new Map<number, { name: string; category: string; revenue: number; units: number }>();
    for (const r of rows) {
      let amount = 0;
      try {
        amount = convertCentsWithRates(Number(r.cents), r.currency, scope.currency, scope.to, rates);
      } catch {
        continue;
      }
      const existing = map.get(r.productId);
      if (existing) {
        existing.revenue += amount;
        existing.units += Number(r.units);
      } else {
        map.set(r.productId, {
          name: r.name, category: r.category, revenue: amount, units: Number(r.units),
        });
      }
    }
    return map;
  };
  const cMap = reduce(curr);
  const pMap = reduce(prev);

  const rows: ProductRow[] = Array.from(cMap.entries()).map(([productId, c]) => {
    const p = pMap.get(productId);
    const prevRev = p?.revenue ?? 0;
    const growthPct = prevRev === 0
      ? (c.revenue > 0 ? 100 : 0)
      : ((c.revenue - prevRev) / prevRev) * 100;
    return { productId, name: c.name, category: c.category, revenue: c.revenue, units: c.units, growthPct };
  });
  rows.sort((a, b) => b.revenue - a.revenue);
  return rows.slice(0, limit);
}
```

- [ ] **Step 10.2:** Type-check and commit:

```bash
npx tsc --noEmit
git add lib/analytics/products.ts
git commit -m "feat(analytics): add top products aggregation with growth %"
```

---

## Task 11: Categories + stores analytics modules

**Files:**
- Create: `lib/analytics/categories.ts`
- Create: `lib/analytics/stores.ts`

- [ ] **Step 11.1:** Create `lib/analytics/categories.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { AnalyticsScope } from "./types";

export interface CategoryShareRow {
  category: string;
  revenue: number;
  share: number;
}

interface RawCatRow {
  category: string;
  cents: bigint;
  currency: string;
}

export async function getCategoryShare(scope: AnalyticsScope): Promise<CategoryShareRow[]> {
  const storeIds = (
    scope.storeId !== undefined
      ? await prisma.store.findMany({ where: { id: scope.storeId, ownerId: scope.ownerId }, select: { id: true } })
      : await prisma.store.findMany({ where: { ownerId: scope.ownerId }, select: { id: true } })
  ).map((r) => r.id);
  if (storeIds.length === 0) return [];

  const rows = await prisma.$queryRaw<RawCatRow[]>(Prisma.sql`
    SELECT c.name AS category, SUM(oi."subtotalCents")::bigint AS cents, o.currency AS currency
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Product" p ON p.id = oi."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${scope.from}
      AND o."placedAt" <  ${scope.to}
    GROUP BY c.name, o.currency;
  `);

  const rates = await loadFxRates(Array.from(new Set(rows.map((r) => r.currency))), scope.currency);
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    let v = 0;
    try {
      v = convertCentsWithRates(Number(r.cents), r.currency, scope.currency, scope.to, rates);
    } catch {
      continue;
    }
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + v);
  }
  const total = Array.from(byCategory.values()).reduce((s, v) => s + v, 0);
  if (total === 0) return [];
  return Array.from(byCategory.entries())
    .map(([category, revenue]) => ({ category, revenue, share: revenue / total }))
    .sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] **Step 11.2:** Create `lib/analytics/stores.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { AnalyticsScope } from "./types";

export interface StoreLeaderboardRow {
  storeId: number;
  name: string;
  revenue: number;
  orders: number;
  aov: number;
}

interface RawStoreRow {
  storeId: number;
  name: string;
  cents: bigint;
  orders: bigint;
  currency: string;
}

export async function getStoreLeaderboard(scope: AnalyticsScope): Promise<StoreLeaderboardRow[]> {
  const stores = await prisma.store.findMany({
    where: scope.storeId !== undefined
      ? { id: scope.storeId, ownerId: scope.ownerId }
      : { ownerId: scope.ownerId },
    select: { id: true, name: true },
  });
  if (stores.length === 0) return [];
  const ids = stores.map((s) => s.id);

  const rows = await prisma.$queryRaw<RawStoreRow[]>(Prisma.sql`
    SELECT
      o."storeId" AS "storeId",
      s.name      AS name,
      SUM(o."totalCents")::bigint AS cents,
      COUNT(*)::bigint           AS orders,
      o.currency  AS currency
    FROM "Order" o
    JOIN "Store" s ON s.id = o."storeId"
    WHERE o."storeId" = ANY(${ids})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${scope.from}
      AND o."placedAt" <  ${scope.to}
    GROUP BY o."storeId", s.name, o.currency;
  `);

  const rates = await loadFxRates(Array.from(new Set(rows.map((r) => r.currency))), scope.currency);
  const merged = new Map<number, { name: string; revenue: number; orders: number }>();
  for (const r of rows) {
    let v = 0;
    try {
      v = convertCentsWithRates(Number(r.cents), r.currency, scope.currency, scope.to, rates);
    } catch {
      continue;
    }
    const existing = merged.get(r.storeId);
    if (existing) {
      existing.revenue += v;
      existing.orders += Number(r.orders);
    } else {
      merged.set(r.storeId, { name: r.name, revenue: v, orders: Number(r.orders) });
    }
  }
  return stores.map((s) => {
    const m = merged.get(s.id);
    const revenue = m?.revenue ?? 0;
    const orders = m?.orders ?? 0;
    return {
      storeId: s.id,
      name: s.name,
      revenue,
      orders,
      aov: orders > 0 ? revenue / orders : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] **Step 11.3:** Type-check and commit:

```bash
npx tsc --noEmit
git add lib/analytics/categories.ts lib/analytics/stores.ts
git commit -m "feat(analytics): add category share and store leaderboard"
```

---

## Task 12: Inventory analytics module

**Files:**
- Create: `lib/analytics/inventory.ts`

- [ ] **Step 12.1:** Create `lib/analytics/inventory.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { AnalyticsScope } from "./types";

export interface StockRow {
  productId: number;
  name: string;
  storeId: number;
  storeName: string;
  onHand: number;
  reorderPoint: number;
  status: "OK" | "LOW" | "OUT";
}

export interface TurnoverRow {
  productId: number;
  name: string;
  turnover: number; // units sold in window / avg on-hand in window
}

interface RawStock {
  productId: number;
  name: string;
  storeId: number;
  storeName: string;
  onHand: bigint;
  reorderPoint: number;
}

async function ownedStoreIds(ownerId: number, storeId?: number): Promise<number[]> {
  const where = storeId !== undefined ? { id: storeId, ownerId } : { ownerId };
  return (await prisma.store.findMany({ where, select: { id: true } })).map((s) => s.id);
}

export async function getStockSnapshot(scope: AnalyticsScope): Promise<StockRow[]> {
  const ids = await ownedStoreIds(scope.ownerId, scope.storeId);
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw<RawStock[]>(Prisma.sql`
    SELECT
      p.id                            AS "productId",
      p.name                          AS name,
      s.id                            AS "storeId",
      s.name                          AS "storeName",
      COALESCE(SUM(m.delta), 0)::bigint AS "onHand",
      p."reorderPoint"                AS "reorderPoint"
    FROM "Product" p
    JOIN "Store" s ON s.id = p."storeId"
    LEFT JOIN "InventoryMovement" m ON m."productId" = p.id AND m."storeId" = p."storeId"
    WHERE p."storeId" = ANY(${ids})
    GROUP BY p.id, p.name, s.id, s.name, p."reorderPoint"
    ORDER BY p.name ASC;
  `);
  return rows.map((r) => {
    const onHand = Number(r.onHand);
    const status: StockRow["status"] = onHand <= 0 ? "OUT" : onHand <= r.reorderPoint ? "LOW" : "OK";
    return {
      productId: r.productId, name: r.name,
      storeId: r.storeId, storeName: r.storeName,
      onHand, reorderPoint: r.reorderPoint, status,
    };
  });
}

export async function getLowStockAlerts(scope: AnalyticsScope): Promise<StockRow[]> {
  const all = await getStockSnapshot(scope);
  return all.filter((r) => r.status !== "OK");
}

export async function getInventoryTurnover(scope: AnalyticsScope): Promise<TurnoverRow[]> {
  const ids = await ownedStoreIds(scope.ownerId, scope.storeId);
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw<{ productId: number; name: string; sold: bigint; onHand: bigint }[]>(Prisma.sql`
    SELECT
      p.id   AS "productId",
      p.name AS name,
      COALESCE(SUM(CASE WHEN m.reason = 'SALE'  AND m."occurredAt" >= ${scope.from} AND m."occurredAt" < ${scope.to} THEN -m.delta ELSE 0 END), 0)::bigint AS sold,
      COALESCE(SUM(m.delta), 0)::bigint AS "onHand"
    FROM "Product" p
    LEFT JOIN "InventoryMovement" m ON m."productId" = p.id
    WHERE p."storeId" = ANY(${ids})
    GROUP BY p.id, p.name
    ORDER BY p.name ASC;
  `);
  return rows.map((r) => {
    const onHand = Math.max(1, Number(r.onHand));
    return { productId: r.productId, name: r.name, turnover: Number(r.sold) / onHand };
  });
}
```

- [ ] **Step 12.2:** Type-check and commit:

```bash
npx tsc --noEmit
git add lib/analytics/inventory.ts
git commit -m "feat(analytics): add inventory snapshot, low-stock alerts, turnover"
```

---

## Task 13: Customers analytics module

**Files:**
- Create: `lib/analytics/customers.ts`

- [ ] **Step 13.1:** Create `lib/analytics/customers.ts`:

```ts
import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { buildDelta } from "./timeframe";
import { AnalyticsScope, Delta } from "./types";

export interface CustomerMix {
  newCount: Delta;
  returningCount: Delta;
}

export interface TopCustomerRow {
  customerId: number;
  email: string;
  orders: number;
  spend: number;
}

async function ownedStoreIds(ownerId: number, storeId?: number): Promise<number[]> {
  const where = storeId !== undefined ? { id: storeId, ownerId } : { ownerId };
  return (await prisma.store.findMany({ where, select: { id: true } })).map((s) => s.id);
}

async function countMix(storeIds: number[], from: Date, to: Date): Promise<{ newC: number; ret: number }> {
  if (storeIds.length === 0) return { newC: 0, ret: 0 };
  const rows = await prisma.$queryRaw<{ isNew: boolean; n: bigint }[]>(Prisma.sql`
    SELECT
      (c."firstOrderAt" IS NOT NULL AND c."firstOrderAt" >= ${from} AND c."firstOrderAt" < ${to}) AS "isNew",
      COUNT(DISTINCT c.id)::bigint AS n
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to}
    GROUP BY "isNew";
  `);
  let newC = 0, ret = 0;
  for (const r of rows) {
    if (r.isNew) newC = Number(r.n); else ret = Number(r.n);
  }
  return { newC, ret };
}

export async function getCustomerMix(scope: AnalyticsScope): Promise<CustomerMix> {
  const storeIds = await ownedStoreIds(scope.ownerId, scope.storeId);
  const span = scope.to.getTime() - scope.from.getTime();
  const [cur, prev] = await Promise.all([
    countMix(storeIds, scope.from, scope.to),
    countMix(storeIds, new Date(scope.from.getTime() - span), scope.from),
  ]);
  return {
    newCount: buildDelta(cur.newC, prev.newC),
    returningCount: buildDelta(cur.ret, prev.ret),
  };
}

export async function getTopCustomers(scope: AnalyticsScope, limit = 10): Promise<TopCustomerRow[]> {
  const storeIds = await ownedStoreIds(scope.ownerId, scope.storeId);
  if (storeIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ customerId: number; email: string; cents: bigint; orders: bigint; currency: string }[]>(Prisma.sql`
    SELECT
      c.id        AS "customerId",
      c.email     AS email,
      SUM(o."totalCents")::bigint AS cents,
      COUNT(*)::bigint            AS orders,
      o.currency  AS currency
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${scope.from}
      AND o."placedAt" <  ${scope.to}
    GROUP BY c.id, c.email, o.currency;
  `);
  const rates = await loadFxRates(Array.from(new Set(rows.map((r) => r.currency))), scope.currency);
  const merged = new Map<number, { email: string; orders: number; spend: number }>();
  for (const r of rows) {
    let v = 0;
    try {
      v = convertCentsWithRates(Number(r.cents), r.currency, scope.currency, scope.to, rates);
    } catch {
      continue;
    }
    const existing = merged.get(r.customerId);
    if (existing) {
      existing.spend += v;
      existing.orders += Number(r.orders);
    } else {
      merged.set(r.customerId, { email: r.email, orders: Number(r.orders), spend: v });
    }
  }
  return Array.from(merged.entries())
    .map(([customerId, v]) => ({ customerId, email: v.email, orders: v.orders, spend: v.spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}
```

- [ ] **Step 13.2:** Type-check and commit:

```bash
npx tsc --noEmit
git add lib/analytics/customers.ts
git commit -m "feat(analytics): add customer mix (new vs returning) and top customers"
```

---

## Task 14: Shared UI primitives (PanelCard, EmptyState, ChartSkeleton, FxWarningBanner)

**Files:**
- Create: `components/dashboard/shared/PanelCard.tsx`
- Create: `components/dashboard/shared/EmptyState.tsx`
- Create: `components/dashboard/shared/ChartSkeleton.tsx`
- Create: `components/dashboard/shared/FxWarningBanner.tsx`

- [ ] **Step 14.1:** Create `components/dashboard/shared/PanelCard.tsx`:

```tsx
import { ReactNode } from "react";

type Props = { title: string; subtitle?: string; action?: ReactNode; children: ReactNode };

export function PanelCard({ title, subtitle, action, children }: Props) {
  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
```

- [ ] **Step 14.2:** Create `components/dashboard/shared/EmptyState.tsx`:

```tsx
import { ReactNode } from "react";

type Props = { title: string; hint?: string; icon?: ReactNode };

export function EmptyState({ title, hint, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      {icon && <div className="mb-2 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 14.3:** Create `components/dashboard/shared/ChartSkeleton.tsx`:

```tsx
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-slate-100"
      style={{ height }}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}
```

- [ ] **Step 14.4:** Create `components/dashboard/shared/FxWarningBanner.tsx`:

```tsx
type Props = { excludedCount: number };

export function FxWarningBanner({ excludedCount }: Props) {
  if (excludedCount <= 0) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      {excludedCount} order{excludedCount === 1 ? "" : "s"} excluded from totals — missing FX rate.
    </div>
  );
}
```

- [ ] **Step 14.5:** Type-check and commit:

```bash
npx tsc --noEmit
git add components/dashboard/shared
git commit -m "feat(dashboard): add shared PanelCard, EmptyState, ChartSkeleton, FxWarningBanner"
```

---

## Task 15: KPI tile + delta formatter (TDD)

**Files:**
- Create: `components/dashboard/kpi/formatDelta.ts`
- Create: `components/dashboard/kpi/KpiTile.tsx`
- Create: `components/dashboard/kpi/__tests__/formatDelta.test.ts`
- Create: `components/dashboard/kpi/__tests__/KpiTile.test.tsx`

- [ ] **Step 15.1: Write the failing delta-formatter tests:**

```ts
// components/dashboard/kpi/__tests__/formatDelta.test.ts
import { describe, it, expect } from "vitest";
import { formatDelta, formatKpiValue } from "../formatDelta";

describe("formatDelta", () => {
  it("formats up delta with +", () => {
    expect(formatDelta({ current: 120, previous: 100, changePct: 20, direction: "up" }))
      .toEqual({ text: "+20.0%", tone: "up" });
  });
  it("formats down delta", () => {
    expect(formatDelta({ current: 80, previous: 100, changePct: -20, direction: "down" }))
      .toEqual({ text: "-20.0%", tone: "down" });
  });
  it("hides delta when previous = 0", () => {
    expect(formatDelta({ current: 50, previous: 0, changePct: 0, direction: "flat" }))
      .toBeNull();
  });
});

describe("formatKpiValue", () => {
  it("formats currency in USD", () => {
    expect(formatKpiValue(1234.5, { kind: "currency", currency: "USD" }))
      .toBe("$1,235");
  });
  it("formats integer count with thousands sep", () => {
    expect(formatKpiValue(12345, { kind: "integer" })).toBe("12,345");
  });
  it("returns em-dash for empty mode", () => {
    expect(formatKpiValue(0, { kind: "integer", emptyWhenZero: true })).toBe("—");
  });
});
```

- [ ] **Step 15.2: Run and verify FAIL:**

```bash
npx vitest run components/dashboard/kpi/__tests__/formatDelta.test.ts
```

Expected: module not found.

- [ ] **Step 15.3: Implement** `components/dashboard/kpi/formatDelta.ts`:

```ts
import type { Delta } from "@/lib/analytics/types";

export type KpiTone = "up" | "down";
export interface FormattedDelta { text: string; tone: KpiTone }

export function formatDelta(d: Delta): FormattedDelta | null {
  if (d.previous === 0 || d.direction === "flat") return null;
  const sign = d.changePct >= 0 ? "+" : "-";
  return { text: `${sign}${Math.abs(d.changePct).toFixed(1)}%`, tone: d.direction === "up" ? "up" : "down" };
}

export type ValueFormat =
  | { kind: "currency"; currency: string; emptyWhenZero?: boolean }
  | { kind: "integer"; emptyWhenZero?: boolean }
  | { kind: "decimal"; digits?: number; emptyWhenZero?: boolean };

export function formatKpiValue(value: number, fmt: ValueFormat): string {
  if (fmt.emptyWhenZero && value === 0) return "—";
  if (fmt.kind === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: fmt.currency,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (fmt.kind === "integer") {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
  }
  return value.toFixed(fmt.digits ?? 2);
}
```

- [ ] **Step 15.4: Run and verify PASS:**

```bash
npx vitest run components/dashboard/kpi/__tests__/formatDelta.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 15.5:** Create `components/dashboard/kpi/KpiTile.tsx`:

```tsx
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Delta } from "@/lib/analytics/types";
import { formatDelta, formatKpiValue, type ValueFormat } from "./formatDelta";

type Props = {
  label: string;
  value: number;
  delta?: Delta;
  format: ValueFormat;
};

export function KpiTile({ label, value, delta, format }: Props) {
  const formatted = delta ? formatDelta(delta) : null;
  const isEmpty = format.emptyWhenZero && value === 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{formatKpiValue(value, format)}</p>
      {!isEmpty && formatted && (
        <p
          className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
            formatted.tone === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {formatted.tone === "up" ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
          <span>{formatted.text}</span>
          <span className="sr-only">{formatted.tone === "up" ? "up" : "down"} vs previous period</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 15.6: Write a smoke test** `components/dashboard/kpi/__tests__/KpiTile.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { KpiTile } from "../KpiTile";

describe("KpiTile", () => {
  it("renders value and up-delta", () => {
    render(
      <KpiTile
        label="Revenue"
        value={12345}
        delta={{ current: 12345, previous: 10000, changePct: 23.45, direction: "up" }}
        format={{ kind: "currency", currency: "USD" }}
      />,
    );
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$12,345")).toBeInTheDocument();
    expect(screen.getByText("+23.5%")).toBeInTheDocument();
  });

  it("renders em-dash and hides delta when empty", () => {
    render(
      <KpiTile
        label="Orders"
        value={0}
        delta={{ current: 0, previous: 0, changePct: 0, direction: "flat" }}
        format={{ kind: "integer", emptyWhenZero: true }}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
```

- [ ] **Step 15.7: Run and verify PASS:**

```bash
npx vitest run components/dashboard/kpi/__tests__/KpiTile.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 15.8: Commit:**

```bash
git add components/dashboard/kpi
git commit -m "feat(dashboard): add KpiTile and delta formatter"
```

---

## Task 16: Filter selectors (RangeSelector, StoreSelector, CurrencySelector, DashboardFilters)

**Files:**
- Create: `components/dashboard/filters/RangeSelector.tsx`
- Create: `components/dashboard/filters/StoreSelector.tsx`
- Create: `components/dashboard/filters/CurrencySelector.tsx`
- Create: `components/dashboard/filters/DashboardFilters.tsx`

- [ ] **Step 16.1:** Create `components/dashboard/filters/RangeSelector.tsx`:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/Button";
import type { Range } from "@/lib/analytics/types";

const RANGES: { value: Range; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function RangeSelector({ value }: { value: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onSelect = useCallback((next: Range) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", next);
    router.push(`${pathname}?${sp.toString()}`);
  }, [router, pathname, params]);

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Timeframe">
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <Button
            key={r.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onSelect(r.value)}
            className={active ? "bg-indigo-200 text-slate-900 hover:bg-indigo-300 hover:text-slate-900" : "text-slate-600 hover:bg-white"}
          >
            {r.label}
          </Button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 16.2:** Create `components/dashboard/filters/StoreSelector.tsx`:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Store = { id: number; name: string };

export function StoreSelector({ stores, value }: { stores: Store[]; value?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sp = new URLSearchParams(params.toString());
    if (e.target.value === "all") sp.delete("storeId");
    else sp.set("storeId", e.target.value);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">Store</span>
      <select
        value={value ?? "all"}
        onChange={onChange}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
      >
        <option value="all">All stores</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 16.3:** Create `components/dashboard/filters/CurrencySelector.tsx`:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const SUPPORTED = ["USD", "EUR", "GBP", "IDR", "JPY"] as const;

export function CurrencySelector({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("currency", e.target.value);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">Currency</span>
      <select
        value={value}
        onChange={onChange}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
      >
        {SUPPORTED.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 16.4:** Create `components/dashboard/filters/DashboardFilters.tsx`:

```tsx
import { CurrencySelector } from "./CurrencySelector";
import { RangeSelector } from "./RangeSelector";
import { StoreSelector } from "./StoreSelector";
import type { Range } from "@/lib/analytics/types";

type Store = { id: number; name: string };

export function DashboardFilters({
  stores, range, storeId, currency,
}: { stores: Store[]; range: Range; storeId?: number; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoreSelector stores={stores} value={storeId} />
      <CurrencySelector value={currency} />
      <RangeSelector value={range} />
    </div>
  );
}
```

- [ ] **Step 16.5: Type-check and commit:**

```bash
npx tsc --noEmit
git add components/dashboard/filters
git commit -m "feat(dashboard): add URL-driven filters (range, store, currency)"
```

---

## Task 17: Revenue trend chart (Recharts)

**Files:**
- Create: `components/dashboard/charts/RevenueTrendChart.tsx`

- [ ] **Step 17.1:** Create `components/dashboard/charts/RevenueTrendChart.tsx`:

```tsx
"use client";

import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/analytics/types";
import { EmptyState } from "../shared/EmptyState";

type Props = {
  currentSeries: TimeSeriesPoint[];
  previousSeries: TimeSeriesPoint[];
  currency: string;
};

export function RevenueTrendChart({ currentSeries, previousSeries, currency }: Props) {
  if (currentSeries.length === 0) {
    return <EmptyState title="No paid orders in this period." hint="Add orders to your store to see revenue trends." />;
  }
  const data = currentSeries.map((p, i) => ({
    label: p.label,
    current: p.value,
    previous: previousSeries[i]?.value ?? null,
  }));
  const formatter = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="h-[320px] w-full" role="img" aria-label={`Revenue trend, ${currency}, ${currentSeries.length} buckets`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
          <YAxis tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => formatter(Number(v))} width={80} />
          <Tooltip formatter={(v: number) => formatter(v)} labelClassName="font-semibold" />
          <Legend />
          <Bar dataKey="previous" name="Previous period" fill="#cbd5f5" />
          <Area type="monotone" dataKey="current" name="Revenue" stroke="#6366f1" fill="#c7d2fe" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 17.2:** Commit:

```bash
git add components/dashboard/charts/RevenueTrendChart.tsx
git commit -m "feat(dashboard): add Recharts revenue trend with previous-period overlay"
```

---

## Task 18: Remaining charts (Store leaderboard, Category share, New-vs-returning)

**Files:**
- Create: `components/dashboard/charts/StoreLeaderboardChart.tsx`
- Create: `components/dashboard/charts/CategoryShareChart.tsx`
- Create: `components/dashboard/charts/NewVsReturningChart.tsx`

- [ ] **Step 18.1:** Create `components/dashboard/charts/StoreLeaderboardChart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Row = { storeId: number; name: string; revenue: number; orders: number; aov: number };

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

export function StoreLeaderboardChart({ rows, currency }: { rows: Row[]; currency: string }) {
  if (rows.length === 0) return <EmptyState title="No store activity yet." />;
  const formatter = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Store leaderboard by revenue">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => formatter(Number(v))} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "#475569" }} width={120} />
          <Tooltip formatter={(v: number) => formatter(v)} />
          <Bar dataKey="revenue" name="Revenue">
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 18.2:** Create `components/dashboard/charts/CategoryShareChart.tsx`:

```tsx
"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Row = { category: string; revenue: number; share: number };
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#84cc16"];

export function CategoryShareChart({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <EmptyState title="No category data for this period." />;
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Revenue share by category">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={rows} dataKey="revenue" nameKey="category" innerRadius={60} outerRadius={90} paddingAngle={2}>
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number, _n, item) => [`${(item.payload.share * 100).toFixed(1)}%`, item.payload.category]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 18.3:** Create `components/dashboard/charts/NewVsReturningChart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Props = { newCount: number; returningCount: number };

export function NewVsReturningChart({ newCount, returningCount }: Props) {
  if (newCount + returningCount === 0) return <EmptyState title="No customers in this period." />;
  const data = [{ label: "Customers", new: newCount, returning: returningCount }];
  return (
    <div className="h-[260px] w-full" role="img" aria-label={`Customer mix: ${newCount} new, ${returningCount} returning`}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
          <YAxis tick={{ fontSize: 12, fill: "#475569" }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="new" name="New" stackId="a" fill="#6366f1" />
          <Bar dataKey="returning" name="Returning" stackId="a" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 18.4:** Type-check and commit:

```bash
npx tsc --noEmit
git add components/dashboard/charts
git commit -m "feat(dashboard): add store leaderboard, category donut, customer-mix charts"
```

---

## Task 19: Tables (TopProductsTable, TopCustomersTable) + InventoryAlertsPanel

**Files:**
- Create: `components/dashboard/tables/TopProductsTable.tsx`
- Create: `components/dashboard/tables/TopCustomersTable.tsx`
- Create: `components/dashboard/inventory/InventoryAlertsPanel.tsx`

- [ ] **Step 19.1:** Create `components/dashboard/tables/TopProductsTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ProductRow } from "@/lib/analytics/products";
import { EmptyState } from "../shared/EmptyState";

type SortKey = "revenue" | "units" | "growthPct";

export function TopProductsTable({ rows, currency }: { rows: ProductRow[]; currency: string }) {
  const [sort, setSort] = useState<SortKey>("revenue");
  const [desc, setDesc] = useState(true);
  if (rows.length === 0) return <EmptyState title="No products sold in this period." />;

  const sorted = [...rows].sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const toggle = (k: SortKey) => {
    if (sort === k) setDesc(!desc);
    else { setSort(k); setDesc(true); }
  };
  const Arrow = desc ? ArrowDown : ArrowUp;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2">#</th>
            <th scope="col" className="px-3 py-2">Product</th>
            <th scope="col" className="px-3 py-2">Category</th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("revenue")}>
              Revenue {sort === "revenue" && <Arrow size={12} className="inline" />}
            </th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("units")}>
              Units {sort === "units" && <Arrow size={12} className="inline" />}
            </th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("growthPct")}>
              Growth {sort === "growthPct" && <Arrow size={12} className="inline" />}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r, i) => (
            <tr key={r.productId}>
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              <td className="px-3 py-2 text-slate-500">{r.category}</td>
              <td className="px-3 py-2 text-slate-700">{fmtMoney(r.revenue)}</td>
              <td className="px-3 py-2 text-slate-700">{r.units}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  r.growthPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}>
                  {r.growthPct >= 0 ? "+" : ""}{r.growthPct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 19.2:** Create `components/dashboard/tables/TopCustomersTable.tsx`:

```tsx
import type { TopCustomerRow } from "@/lib/analytics/customers";
import { EmptyState } from "../shared/EmptyState";

export function TopCustomersTable({ rows, currency }: { rows: TopCustomerRow[]; currency: string }) {
  if (rows.length === 0) return <EmptyState title="No customers in this period." />;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2">Customer</th>
            <th scope="col" className="px-3 py-2">Orders</th>
            <th scope="col" className="px-3 py-2">Spend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.email}</td>
              <td className="px-3 py-2 text-slate-700">{r.orders}</td>
              <td className="px-3 py-2 text-slate-700">{fmt(r.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 19.3:** Create `components/dashboard/inventory/InventoryAlertsPanel.tsx`:

```tsx
import type { StockRow } from "@/lib/analytics/inventory";
import { EmptyState } from "../shared/EmptyState";

export function InventoryAlertsPanel({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="All inventory is healthy." hint="No items below their reorder point." />;
  }
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.map((r) => (
        <li key={`${r.storeId}-${r.productId}`} className="flex items-center justify-between px-1 py-2">
          <div>
            <p className="font-medium text-slate-800">{r.name}</p>
            <p className="text-xs text-slate-500">{r.storeName} · reorder at {r.reorderPoint}</p>
          </div>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            r.status === "OUT" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
          }`}>
            {r.status === "OUT" ? "OUT" : `LOW · ${r.onHand}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 19.4:** Type-check and commit:

```bash
npx tsc --noEmit
git add components/dashboard/tables components/dashboard/inventory
git commit -m "feat(dashboard): add top products / top customers tables and inventory alerts"
```

---

## Task 20: KpiRow (server component that fetches all KPIs)

**Files:**
- Create: `components/dashboard/kpi/KpiRow.tsx`

- [ ] **Step 20.1:** Create `components/dashboard/kpi/KpiRow.tsx`:

```tsx
import { getRevenueSummary } from "@/lib/analytics/revenue";
import { getCustomerMix } from "@/lib/analytics/customers";
import type { AnalyticsScope } from "@/lib/analytics/types";
import { KpiTile } from "./KpiTile";

export async function KpiRow({ scope }: { scope: AnalyticsScope }) {
  const [rev, mix] = await Promise.all([
    getRevenueSummary(scope),
    getCustomerMix(scope),
  ]);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile
        label="Revenue"
        value={rev.revenue.current}
        delta={rev.revenue}
        format={{ kind: "currency", currency: scope.currency, emptyWhenZero: true }}
      />
      <KpiTile
        label="Orders"
        value={rev.orders.current}
        delta={rev.orders}
        format={{ kind: "integer", emptyWhenZero: true }}
      />
      <KpiTile
        label="AOV"
        value={rev.aov.current}
        delta={rev.aov}
        format={{ kind: "currency", currency: scope.currency, emptyWhenZero: true }}
      />
      <KpiTile
        label="New customers"
        value={mix.newCount.current}
        delta={mix.newCount}
        format={{ kind: "integer", emptyWhenZero: true }}
      />
    </div>
  );
}
```

- [ ] **Step 20.2:** Type-check and commit:

```bash
npx tsc --noEmit
git add components/dashboard/kpi/KpiRow.tsx
git commit -m "feat(dashboard): add KpiRow that fans out summary fetches"
```

---

## Task 21: Wire the dashboard page + error boundary, delete legacy components

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `app/dashboard/error.tsx`
- Delete: `components/dashboard/TimeframeChart.tsx`
- Delete: `components/dashboard/ProductCard.tsx`
- Delete: `components/dashboard/ProductCards.tsx`

- [ ] **Step 21.1:** Replace `app/dashboard/page.tsx`:

```tsx
import { Suspense } from "react";
import { requireAccountId } from "@/lib/session-helpers";
import { getStoresForOwner } from "@/lib/repository/stores";
import { parseDashboardSearchParams } from "@/lib/dashboard/search-params";
import { resolveWindow } from "@/lib/analytics/timeframe";
import type { AnalyticsScope } from "@/lib/analytics/types";

import { DashboardFilters } from "@/components/dashboard/filters/DashboardFilters";
import { KpiRow } from "@/components/dashboard/kpi/KpiRow";
import { PanelCard } from "@/components/dashboard/shared/PanelCard";
import { ChartSkeleton } from "@/components/dashboard/shared/ChartSkeleton";
import { RevenueTrendChart } from "@/components/dashboard/charts/RevenueTrendChart";
import { StoreLeaderboardChart } from "@/components/dashboard/charts/StoreLeaderboardChart";
import { CategoryShareChart } from "@/components/dashboard/charts/CategoryShareChart";
import { NewVsReturningChart } from "@/components/dashboard/charts/NewVsReturningChart";
import { TopProductsTable } from "@/components/dashboard/tables/TopProductsTable";
import { TopCustomersTable } from "@/components/dashboard/tables/TopCustomersTable";
import { InventoryAlertsPanel } from "@/components/dashboard/inventory/InventoryAlertsPanel";

import { getRevenueTimeSeries } from "@/lib/analytics/revenue";
import { getTopProducts } from "@/lib/analytics/products";
import { getCategoryShare } from "@/lib/analytics/categories";
import { getStoreLeaderboard } from "@/lib/analytics/stores";
import { getCustomerMix, getTopCustomers } from "@/lib/analytics/customers";
import { getLowStockAlerts } from "@/lib/analytics/inventory";

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ownerId = await requireAccountId();
  const stores = await getStoresForOwner(ownerId);
  const sp = await searchParams;
  const parsed = parseDashboardSearchParams(sp);

  const defaultCurrency = stores[0]?.baseCurrency ?? "USD";
  const currency = parsed.currency ?? defaultCurrency;
  const window = resolveWindow(parsed.range, parsed.from, parsed.to);
  const scope: AnalyticsScope = {
    ownerId,
    storeId: parsed.storeId,
    from: window.from,
    to: window.to,
    currency,
  };
  const prevScope: AnalyticsScope = { ...scope, from: window.previousFrom, to: window.previousTo };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live analytics across your stores.</p>
        </div>
        <DashboardFilters stores={stores} range={parsed.range} storeId={parsed.storeId} currency={currency} />
      </header>

      <Suspense fallback={<ChartSkeleton height={96} />}>
        <KpiRow scope={scope} />
      </Suspense>

      <div className="mt-6">
        <PanelCard title="Revenue trend" subtitle={`${parsed.range} view, ${currency}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueTrendPanel scope={scope} prevScope={prevScope} range={parsed.range} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="Store leaderboard">
          <Suspense fallback={<ChartSkeleton height={280} />}>
            <StoreLeaderboardPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Category share">
          <Suspense fallback={<ChartSkeleton height={280} />}>
            <CategorySharePanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="Top products">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <TopProductsPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Inventory alerts">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <InventoryPanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="New vs returning customers">
          <Suspense fallback={<ChartSkeleton height={260} />}>
            <CustomerMixPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Top customers">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <TopCustomersPanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>
    </main>
  );
}

async function RevenueTrendPanel({ scope, prevScope, range }: { scope: AnalyticsScope; prevScope: AnalyticsScope; range: "daily" | "weekly" | "monthly" }) {
  const [cur, prev] = await Promise.all([
    getRevenueTimeSeries(scope, range),
    getRevenueTimeSeries(prevScope, range),
  ]);
  return <RevenueTrendChart currentSeries={cur} previousSeries={prev} currency={scope.currency} />;
}
async function StoreLeaderboardPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getStoreLeaderboard(scope);
  return <StoreLeaderboardChart rows={rows} currency={scope.currency} />;
}
async function CategorySharePanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getCategoryShare(scope);
  return <CategoryShareChart rows={rows} />;
}
async function TopProductsPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopProducts(scope);
  return <TopProductsTable rows={rows} currency={scope.currency} />;
}
async function InventoryPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLowStockAlerts(scope);
  return <InventoryAlertsPanel rows={rows} />;
}
async function CustomerMixPanel({ scope }: { scope: AnalyticsScope }) {
  const mix = await getCustomerMix(scope);
  return <NewVsReturningChart newCount={mix.newCount.current} returningCount={mix.returningCount.current} />;
}
async function TopCustomersPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopCustomers(scope);
  return <TopCustomersTable rows={rows} currency={scope.currency} />;
}
```

- [ ] **Step 21.2:** Create `app/dashboard/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard] error:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-lg font-semibold text-rose-900">Couldn&apos;t load the dashboard</h1>
        <p className="mt-1 text-sm text-rose-700">Something went wrong while fetching analytics. You can try again.</p>
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={() => reset()}>Retry</Button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 21.3:** Delete legacy components:

```bash
rm components/dashboard/TimeframeChart.tsx
rm components/dashboard/ProductCard.tsx
rm components/dashboard/ProductCards.tsx
```

- [ ] **Step 21.4:** Verify nothing else imports them:

```bash
rg "TimeframeChart|ProductCards?\.tsx|@/components/dashboard/ProductCard" --type ts --type tsx
```

Expected: no matches.

- [ ] **Step 21.5:** Type-check the whole project:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 21.6:** Run all tests:

```bash
npm run test:run
```

Expected: all tests green (timeframe, fx, search-params, formatDelta, KpiTile).

- [ ] **Step 21.7:** Smoke-build:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 21.8: Commit:**

```bash
git add app/dashboard/page.tsx app/dashboard/error.tsx
git add -u components/dashboard
git commit -m "feat(dashboard): wire new analytics page with Suspense panels and error boundary"
```

---

## Task 22: Manual end-to-end smoke (with hand-inserted data)

This task is **manual** — there are no tests because there's no seed data by design. Run it after Task 21 to validate the system works end-to-end.

- [ ] **Step 22.1:** Start dev server: `npm run dev`. Log in (or sign up).

- [ ] **Step 22.2:** Open Prisma Studio in another terminal: `npx prisma studio`.

- [ ] **Step 22.3:** Insert minimal data via Studio:
  1. `Category` → `{ name: "Apparel" }`.
  2. `Store` → set `ownerId` to the logged-in user's `accountId`, `baseCurrency: "USD"`.
  3. `Product` → `{ sku: "TEE-001", name: "Test Tee", categoryId, storeId, unitPriceCents: 2500, reorderPoint: 5 }`.
  4. `Customer` → `{ email: "alice@example.com" }`. (Optionally set `firstOrderAt` to today.)
  5. `Order` → `{ storeId, customerId, status: "PAID", currency: "USD", totalCents: 5000, placedAt: today, paidAt: today }`.
  6. `OrderItem` → `{ orderId, productId, quantity: 2, unitPriceCents: 2500, subtotalCents: 5000 }`.
  7. `InventoryMovement` (purchase) → `{ storeId, productId, delta: 10, reason: "PURCHASE", occurredAt: yesterday }`.
  8. `InventoryMovement` (sale) → `{ storeId, productId, delta: -2, reason: "SALE", orderId, occurredAt: today }`.

- [ ] **Step 22.4:** Visit `/dashboard`. Verify:
  - KPI tiles show $50 Revenue, 1 Order, $50 AOV, 1 New customer.
  - Revenue trend chart shows a single day spike.
  - Store leaderboard lists the store with $50.
  - Category share shows 100% Apparel.
  - Top products lists "Test Tee".
  - Inventory alerts shows nothing (stock 8, reorder 5 → OK). Insert an `ADJUSTMENT` movement of -5 to drop stock and confirm a LOW badge appears.
  - Switch `?range=weekly` and `?range=monthly` — chart re-buckets without errors.
  - Switch currency to EUR. Without an `FxRate` for USD→EUR, totals should drop to zero with no crash. Add an `FxRate` row `{ baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.9, asOf: yesterday }` and refresh — totals now show in EUR.

- [ ] **Step 22.5:** Final commit if any docs / fixes:

```bash
git add -A
git commit -m "chore(dashboard): manual smoke validated" || echo "nothing to commit"
```

---

## Verification checklist

- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] `npm run test:run` passes (all unit tests).
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` passes (or only warns, no errors).
- [ ] Task 22 manual smoke matches expected values.
- [ ] No references remain to `TimeframeChart`, `ProductCard`, `ProductCards`, or the legacy `Product.revenue/orders/growth` columns.

---

## Deferred polish (not in scope for this plan)

These are spec items intentionally left out of this plan to keep it bite-sized. Each is small enough to be a follow-up PR after the dashboard is working end-to-end.

1. **Wire `FxWarningBanner` into the page.** The component is created in Task 14 but not displayed. To enable: change analytics modules to also return a `excludedOrders` count alongside the data, propagate up to `page.tsx`, and render `<FxWarningBanner excludedCount={total} />` just below the `<header>`.
2. **Caching with `unstable_cache` + `revalidateTag('analytics')`.** Wrap each analytics function with `unstable_cache(fn, [key parts], { tags: ['analytics'] })` and call `revalidateTag('analytics')` from order/inventory mutations once they exist.
3. **Component smoke tests for filter selectors.** RangeSelector / StoreSelector / CurrencySelector currently rely on type-check + manual smoke only.
4. **Integration tests against a real Postgres test DB** (using `docker-compose` + a `DATABASE_URL_TEST` env). The current plan has pure-unit-test coverage for the helpers; SQL queries are validated by Task 22 manual smoke only.

