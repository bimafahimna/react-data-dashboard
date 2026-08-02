import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { convertCentsWithRates, loadFxRates } from "./fx";
import { buildDelta, shiftYearsUtc } from "./timeframe";
import type {
  AnalyticsScope,
  DashboardKpis,
  KpiSummary,
  PerStoreKpiRow,
} from "./types";

interface OrderAggRow {
  currency: string;
  revenue_cents: bigint;
  orders: bigint;
  unique_customers: bigint | null;
}

interface ItemsRow {
  items: bigint | null;
}

interface CustomerCountsRow {
  new_customers: bigint | null;
  repeat_customers: bigint | null;
}

interface PerStoreOrderAggRow {
  storeId: number;
  currency: string;
  revenue_cents: bigint;
  orders: bigint;
  unique_customers: bigint | null;
}

interface PerStoreItemsRow {
  storeId: number;
  items: bigint | null;
}

interface PerStoreCustomerCountsRow {
  storeId: number;
  new_customers: bigint | null;
  repeat_customers: bigint | null;
}

function toN(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

interface StoreMeta {
  id: number;
  name: string;
  location: string;
  baseCurrency: string;
}

interface WindowTotals {
  revenue: number;
  orders: number;
  uniqueCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  itemsSold: number;
}

async function getOwnedStores(scope: AnalyticsScope): Promise<StoreMeta[]> {
  const where =
    scope.storeId !== undefined
      ? { id: scope.storeId, ownerId: scope.ownerId }
      : { ownerId: scope.ownerId };
  return prisma.store.findMany({
    where,
    select: { id: true, name: true, location: true, baseCurrency: true },
    orderBy: { id: "asc" },
  });
}

async function queryOrderAgg(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<OrderAggRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<OrderAggRow[]>(Prisma.sql`
    SELECT
      currency,
      SUM("totalCents")::bigint AS revenue_cents,
      COUNT(*)::bigint          AS orders,
      COUNT(DISTINCT "customerId")
        FILTER (WHERE "customerId" IS NOT NULL)::bigint AS unique_customers
    FROM "Order"
    WHERE "storeId" = ANY(${storeIds})
      AND status = 'PAID'
      AND "placedAt" >= ${from}
      AND "placedAt" <  ${to}
    GROUP BY currency;
  `);
}

async function queryItems(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<ItemsRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<ItemsRow[]>(Prisma.sql`
    SELECT SUM(oi.quantity)::bigint AS items
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to};
  `);
}

async function queryCustomerCounts(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<CustomerCountsRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<CustomerCountsRow[]>(Prisma.sql`
    SELECT
      COUNT(DISTINCT o."customerId") FILTER (
        WHERE c."firstOrderAt" >= ${from} AND c."firstOrderAt" < ${to}
      )::bigint AS new_customers,
      COUNT(DISTINCT o."customerId") FILTER (
        WHERE c."firstOrderAt" <  ${from}
      )::bigint AS repeat_customers
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to};
  `);
}

async function reduceWindow(
  storeIds: number[],
  from: Date,
  to: Date,
  target: string,
  asOf: Date,
): Promise<WindowTotals> {
  const [orderRows, itemRows, custRows] = await Promise.all([
    queryOrderAgg(storeIds, from, to),
    queryItems(storeIds, from, to),
    queryCustomerCounts(storeIds, from, to),
  ]);

  const currencies = Array.from(new Set(orderRows.map((r) => r.currency)));
  const rates = await loadFxRates(currencies, target);

  let revenue = 0;
  let orders = 0;
  let uniqueCustomers = 0;
  for (const r of orderRows) {
    try {
      revenue += convertCentsWithRates(
        toN(r.revenue_cents),
        r.currency,
        target,
        asOf,
        rates,
      );
    } catch {
      // Skip rows we can't FX-convert; FxWarningBanner surfaces the gap.
      continue;
    }
    orders += toN(r.orders);
    uniqueCustomers += toN(r.unique_customers);
  }

  const itemsSold = toN(itemRows[0]?.items);
  const newCustomers = toN(custRows[0]?.new_customers);
  const repeatCustomers = toN(custRows[0]?.repeat_customers);

  return { revenue, orders, uniqueCustomers, newCustomers, repeatCustomers, itemsSold };
}

function aov(revenue: number, orders: number): number {
  return orders > 0 ? revenue / orders : 0;
}

function summary(current: number, prev: number, yoy: number): KpiSummary {
  return {
    current,
    deltaPrev: buildDelta(current, prev),
    deltaYoy: buildDelta(current, yoy),
  };
}

export async function getDashboardKpis(scope: AnalyticsScope): Promise<DashboardKpis> {
  const stores = await getOwnedStores(scope);
  const storeIds = stores.map((s) => s.id);

  const span = scope.to.getTime() - scope.from.getTime();
  const prevFrom = new Date(scope.from.getTime() - span);
  const prevTo = scope.from;
  const yoyFrom = shiftYearsUtc(scope.from, -1);
  const yoyTo = shiftYearsUtc(scope.to, -1);

  const [cur, prev, yoy] = await Promise.all([
    reduceWindow(storeIds, scope.from, scope.to, scope.currency, scope.to),
    reduceWindow(storeIds, prevFrom, prevTo, scope.currency, prevTo),
    reduceWindow(storeIds, yoyFrom, yoyTo, scope.currency, yoyTo),
  ]);

  return {
    revenue: summary(cur.revenue, prev.revenue, yoy.revenue),
    orders: summary(cur.orders, prev.orders, yoy.orders),
    uniqueCustomers: summary(cur.uniqueCustomers, prev.uniqueCustomers, yoy.uniqueCustomers),
    aov: summary(
      aov(cur.revenue, cur.orders),
      aov(prev.revenue, prev.orders),
      aov(yoy.revenue, yoy.orders),
    ),
    newCustomers: summary(cur.newCustomers, prev.newCustomers, yoy.newCustomers),
    repeatCustomers: summary(cur.repeatCustomers, prev.repeatCustomers, yoy.repeatCustomers),
    itemsSold: summary(cur.itemsSold, prev.itemsSold, yoy.itemsSold),
  };
}

async function queryPerStoreOrderAgg(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<PerStoreOrderAggRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<PerStoreOrderAggRow[]>(Prisma.sql`
    SELECT
      o."storeId"                                                        AS "storeId",
      o.currency                                                         AS currency,
      SUM(o."totalCents")::bigint                                        AS revenue_cents,
      COUNT(*)::bigint                                                   AS orders,
      COUNT(DISTINCT o."customerId")
        FILTER (WHERE o."customerId" IS NOT NULL)::bigint                AS unique_customers
    FROM "Order" o
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to}
    GROUP BY o."storeId", o.currency;
  `);
}

async function queryPerStoreItems(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<PerStoreItemsRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<PerStoreItemsRow[]>(Prisma.sql`
    SELECT
      o."storeId"                     AS "storeId",
      SUM(oi.quantity)::bigint        AS items
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to}
    GROUP BY o."storeId";
  `);
}

async function queryPerStoreCustomerCounts(
  storeIds: number[],
  from: Date,
  to: Date,
): Promise<PerStoreCustomerCountsRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<PerStoreCustomerCountsRow[]>(Prisma.sql`
    SELECT
      o."storeId"                                                         AS "storeId",
      COUNT(DISTINCT o."customerId") FILTER (
        WHERE c."firstOrderAt" >= ${from} AND c."firstOrderAt" < ${to}
      )::bigint AS new_customers,
      COUNT(DISTINCT o."customerId") FILTER (
        WHERE c."firstOrderAt" <  ${from}
      )::bigint AS repeat_customers
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."storeId" = ANY(${storeIds})
      AND o.status = 'PAID'
      AND o."placedAt" >= ${from}
      AND o."placedAt" <  ${to}
    GROUP BY o."storeId";
  `);
}

export async function getPerStoreKpis(scope: AnalyticsScope): Promise<PerStoreKpiRow[]> {
  const stores = await getOwnedStores(scope);
  if (stores.length === 0) return [];
  const storeIds = stores.map((s) => s.id);

  const [orderRows, itemRows, custRows] = await Promise.all([
    queryPerStoreOrderAgg(storeIds, scope.from, scope.to),
    queryPerStoreItems(storeIds, scope.from, scope.to),
    queryPerStoreCustomerCounts(storeIds, scope.from, scope.to),
  ]);

  const currencies = Array.from(new Set(orderRows.map((r) => r.currency)));
  const rates = await loadFxRates(currencies, scope.currency);

  interface PerStoreAgg {
    revenue: number;
    orders: number;
    uniqueCustomers: number;
  }
  const orderByStore = new Map<number, PerStoreAgg>();
  for (const r of orderRows) {
    let converted = 0;
    try {
      converted = convertCentsWithRates(
        toN(r.revenue_cents),
        r.currency,
        scope.currency,
        scope.to,
        rates,
      );
    } catch {
      continue;
    }
    const existing = orderByStore.get(r.storeId);
    if (existing) {
      existing.revenue += converted;
      existing.orders += toN(r.orders);
      existing.uniqueCustomers += toN(r.unique_customers);
    } else {
      orderByStore.set(r.storeId, {
        revenue: converted,
        orders: toN(r.orders),
        uniqueCustomers: toN(r.unique_customers),
      });
    }
  }

  const itemsByStore = new Map<number, number>();
  for (const r of itemRows) {
    itemsByStore.set(r.storeId, toN(r.items));
  }
  const custByStore = new Map<number, { newC: number; repeat: number }>();
  for (const r of custRows) {
    custByStore.set(r.storeId, {
      newC: toN(r.new_customers),
      repeat: toN(r.repeat_customers),
    });
  }

  const out: PerStoreKpiRow[] = stores.map((s) => {
    const o = orderByStore.get(s.id);
    const revenue = o?.revenue ?? 0;
    const orders = o?.orders ?? 0;
    const uniqueCustomers = o?.uniqueCustomers ?? 0;
    const itemsSold = itemsByStore.get(s.id) ?? 0;
    const c = custByStore.get(s.id);
    return {
      storeId: s.id,
      storeName: s.name,
      location: s.location,
      baseCurrency: s.baseCurrency,
      revenue,
      orders,
      uniqueCustomers,
      aov: orders > 0 ? revenue / orders : 0,
      newCustomers: c?.newC ?? 0,
      repeatCustomers: c?.repeat ?? 0,
      itemsSold,
    };
  });

  return out.sort((a, b) => b.revenue - a.revenue);
}
