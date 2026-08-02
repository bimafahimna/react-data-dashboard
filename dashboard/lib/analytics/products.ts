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
