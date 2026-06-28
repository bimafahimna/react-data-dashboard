"use server"

import { prisma } from "../prisma";

export interface Store {
    id: number;
    name: string;
    location: string;
}

export async function getStores(): Promise<Store[]> {
    const stores = await prisma.store.findMany();
    return stores.map((store) => ({
        id: store.id,
        name: store.name,
        location: store.location,
    }));
}