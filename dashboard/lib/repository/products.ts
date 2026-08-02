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
