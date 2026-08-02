export type Range = "daily" | "weekly" | "monthly";
export type Bucket = "day" | "week" | "month";

export interface AnalyticsScope {
  ownerId: number;
  storeId?: number;
  from: Date;
  to: Date;
  currency: string;
}

export interface TimeSeriesPoint {
  bucket: Date;
  label: string;
  value: number;
}

export type Direction = "up" | "down" | "flat";

export interface Delta<T = number> {
  current: T;
  previous: T;
  changeNominal: number;
  changePct: number;
  direction: Direction;
}

export interface KpiSummary {
  current: number;
  deltaPrev: Delta;
  deltaYoy: Delta;
}

export interface DashboardKpis {
  revenue: KpiSummary;
  orders: KpiSummary;
  uniqueCustomers: KpiSummary;
  aov: KpiSummary;
  newCustomers: KpiSummary;
  repeatCustomers: KpiSummary;
  itemsSold: KpiSummary;
}

export interface PerStoreKpiRow {
  storeId: number;
  storeName: string;
  location: string;
  baseCurrency: string;
  revenue: number;
  orders: number;
  uniqueCustomers: number;
  aov: number;
  newCustomers: number;
  repeatCustomers: number;
  itemsSold: number;
}

export const RANGE_TO_BUCKET: Record<Range, Bucket> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

export class AnalyticsError extends Error {
  constructor(public code: "FX_MISSING" | "DB_UNAVAILABLE" | "INVALID_RANGE", message: string) {
    super(`${code}: ${message}`);
    this.name = "AnalyticsError";
  }
}
