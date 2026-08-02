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
