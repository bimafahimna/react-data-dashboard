import { prisma } from "../prisma";
import { AnalyticsError } from "./types";

export interface FxRateLookup {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  asOf: Date;
}

export function convertCentsWithRates(
  cents: number,
  sourceCurrency: string,
  targetCurrency: string,
  asOf: Date,
  rates: FxRateLookup[],
): number {
  const major = cents / 100;
  if (sourceCurrency === targetCurrency) return major;

  const candidates = rates
    .filter(
      (r) =>
        r.baseCurrency === sourceCurrency &&
        r.quoteCurrency === targetCurrency &&
        r.asOf.getTime() <= asOf.getTime(),
    )
    .sort((a, b) => b.asOf.getTime() - a.asOf.getTime());

  if (candidates.length === 0) {
    throw new AnalyticsError(
      "FX_MISSING",
      `No FX rate for ${sourceCurrency}->${targetCurrency} at or before ${asOf.toISOString()}`,
    );
  }
  return major * candidates[0].rate;
}

export async function loadFxRates(
  sourceCurrencies: string[],
  target: string,
): Promise<FxRateLookup[]> {
  const sources = Array.from(new Set(sourceCurrencies.filter((c) => c !== target)));
  if (sources.length === 0) return [];
  const rows = await prisma.fxRate.findMany({
    where: { baseCurrency: { in: sources }, quoteCurrency: target },
    orderBy: { asOf: "asc" },
  });
  return rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
}
