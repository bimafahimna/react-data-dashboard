"use server";

import { prisma } from "../prisma";

export interface Product {
    id: number;
    name: string;
    category: string;
    revenue: number;
    orders: number;
    growth: number;
    storeId: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function getProductsByStoreId(storeId: number): Promise<Product[]> {
    const products = await prisma.product.findMany({
    where: {
      storeId: storeId,
    },
  });

    return products;
}