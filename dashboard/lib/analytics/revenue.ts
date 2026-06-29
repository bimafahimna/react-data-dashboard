import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../prisma";
import { loadFxRates, convertCentsWithRates } from "./fx";
import { buildDelta } from "./timeframe";
import { AnalyticsScope, Bucket, Delta, Range, RANGE_TO_BUCKET, TimeSeriesPoint } from "./types";

interface RawRevRow {
  bucket: Date;
  cents: bigint;
  orders: bigint;
  currency: string;
}

const DAY_MS = 86_400_000;

function bucketLiteral(bucket: Bucket): Prisma.Sql {
  switch (bucket) {
    case "day": return Prisma.sql`'day'`;
    case "week": return Prisma.sql`'week'`;
    case "month": return Prisma.sql`'month'`;
  }
}

function labelFor(bucket: Bucket, d: Date): string {
  if (bucket === "month") return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (bucket === "week") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fillBuckets(rows: { bucket: Date; value: number }[], from: Date, to: Date, bucket: Bucket): { bucket: Date; value: number }[] {
  const stepMs = bucket === "day" ? DAY_MS : bucket === "week" ? 7 * DAY_MS : 0;
  const byKey = new Map(rows.map((r) => [r.bucket.toISOString(), r.value]));
  const out: { bucket: Date; value: number }[] = [];
  if (bucket === "month") {
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cur < end) {
      out.push({ bucket: cur, value: byKey.get(cur.toISOString()) ?? 0 });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  } else {
    for (let t = from.getTime(); t < to.getTime(); t += stepMs) {
      const b = new Date(t);
      out.push({ bucket: b, value: byKey.get(b.toISOString()) ?? 0 });
    }
  }
  return out;
}

async function getStoreIds(scope: AnalyticsScope): Promise<number[]> {
  if (scope.storeId !== undefined) {
    const owned = await prisma.store.findFirst({
      where: { id: scope.storeId, ownerId: scope.ownerId },
      select: { id: true },
    });
    return owned ? [owned.id] : [];
  }
  const rows = await prisma.store.findMany({
    where: { ownerId: scope.ownerId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function queryBucketed(
  storeIds: number[],
  from: Date,
  to: Date,
  bucket: Bucket,
): Promise<RawRevRow[]> {
  if (storeIds.length === 0) return [];
  return prisma.$queryRaw<RawRevRow[]>(Prisma.sql`
    SELECT
      date_trunc(${bucketLiteral(bucket)}, "placedAt" AT TIME ZONE 'UTC') AS bucket,
      SUM("totalCents")::bigint AS cents,
      COUNT(*)::bigint AS orders,
      currency
    FROM "Order"
    WHERE "storeId" = ANY(${storeIds})
      AND status = 'PAID'
      AND "placedAt" >= ${from}
      AND "placedAt" <  ${to}
    GROUP BY bucket, currency
    ORDER BY bucket ASC;
  `);
}

async function convertRows(rows: RawRevRow[], target: string): Promise<{ bucket: Date; value: number; orders: number }[]> {
  const currencies = Array.from(new Set(rows.map((r) => r.currency)));
  const rates = await loadFxRates(currencies, target);
  const grouped = new Map<string, { bucket: Date; value: number; orders: number }>();
  for (const r of rows) {
    let value = 0;
    try {
      value = convertCentsWithRates(Number(r.cents), r.currency, target, r.bucket, rates);
    } catch {
      continue;
    }
    const key = r.bucket.toISOString();
    const existing = grouped.get(key);
    if (existing) {
      existing.value += value;
      existing.orders += Number(r.orders);
    } else {
      grouped.set(key, { bucket: r.bucket, value, orders: Number(r.orders) });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.bucket.getTime() - b.bucket.getTime());
}

export async function getRevenueTimeSeries(scope: AnalyticsScope, range: Range): Promise<TimeSeriesPoint[]> {
  const storeIds = await getStoreIds(scope);
  const bucket = RANGE_TO_BUCKET[range];
  const rows = await queryBucketed(storeIds, scope.from, scope.to, bucket);
  const converted = await convertRows(rows, scope.currency);
  const filled = fillBuckets(
    converted.map((c) => ({ bucket: c.bucket, value: c.value })),
    scope.from,
    scope.to,
    bucket,
  );
  return filled.map((p) => ({ bucket: p.bucket, label: labelFor(bucket, p.bucket), value: p.value }));
}

export interface RevenueSummary {
  revenue: Delta;
  orders: Delta;
  aov: Delta;
}

export async function getRevenueSummary(scope: AnalyticsScope): Promise<RevenueSummary> {
  const storeIds = await getStoreIds(scope);
  const bucket = "day"; // bucket choice doesn't affect summed total
  const [currentRows, prevRows] = await Promise.all([
    queryBucketed(storeIds, scope.from, scope.to, bucket),
    queryBucketed(
      storeIds,
      new Date(scope.from.getTime() - (scope.to.getTime() - scope.from.getTime())),
      scope.from,
      bucket,
    ),
  ]);
  const [cur, prev] = await Promise.all([
    convertRows(currentRows, scope.currency),
    convertRows(prevRows, scope.currency),
  ]);

  const sum = (rows: { value: number; orders: number }[]) =>
    rows.reduce((acc, r) => ({ revenue: acc.revenue + r.value, orders: acc.orders + r.orders }), {
      revenue: 0,
      orders: 0,
    });
  const curT = sum(cur);
  const prevT = sum(prev);
  const curAov = curT.orders > 0 ? curT.revenue / curT.orders : 0;
  const prevAov = prevT.orders > 0 ? prevT.revenue / prevT.orders : 0;
  return {
    revenue: buildDelta(curT.revenue, prevT.revenue),
    orders: buildDelta(curT.orders, prevT.orders),
    aov: buildDelta(curAov, prevAov),
  };
}
