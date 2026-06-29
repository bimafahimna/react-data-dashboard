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
  changePct: number;
  direction: Direction;
}

export const RANGE_TO_BUCKET: Record<Range, Bucket> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

export class AnalyticsError extends Error {
  constructor(public code: "FX_MISSING" | "DB_UNAVAILABLE" | "INVALID_RANGE", message: string) {
    super(message);
    this.name = "AnalyticsError";
  }
}
