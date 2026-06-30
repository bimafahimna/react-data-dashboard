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
