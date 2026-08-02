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
