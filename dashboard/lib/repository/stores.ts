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
