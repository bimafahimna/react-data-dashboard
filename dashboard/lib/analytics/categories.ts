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
