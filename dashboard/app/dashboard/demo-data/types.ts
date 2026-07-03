export type SeedMode = "reseed" | "keep" | "clear";

export type ClearedCounts = {
  inventoryMovements: number;
  orderItems: number;
  orders: number;
  products: number;
  customers: number;
  stores: number;
  fxRates: number;
};

export type InsertedCounts = {
  stores: number;
  products: number;
  customers: number;
  orders: number;
  orderItems: number;
  inventoryMovements: number;
  fxRates: number;
};

export type SeedSummary = {
  mode: SeedMode;
  ranAt: string;
  durationMs: number;
  seedString: string;
  cleared: ClearedCounts | null;
  inserted: InsertedCounts | null;
};

export type ActionResult =
  | { ok: true; summary: SeedSummary }
  | { ok: false; message: string };
