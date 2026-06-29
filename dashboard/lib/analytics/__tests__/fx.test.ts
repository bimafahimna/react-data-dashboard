import { describe, it, expect } from "vitest";
import { convertCentsWithRates, type FxRateLookup } from "../fx";

const rates: FxRateLookup[] = [
  { baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.9, asOf: new Date("2026-06-01") },
  { baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.92, asOf: new Date("2026-06-20") },
];

describe("convertCentsWithRates", () => {
  it("returns major units unchanged when source equals target", () => {
    expect(convertCentsWithRates(12345, "USD", "USD", new Date("2026-06-15"), rates))
      .toBeCloseTo(123.45, 2);
  });

  it("uses most-recent rate at-or-before asOf", () => {
    const out = convertCentsWithRates(10000, "USD", "EUR", new Date("2026-06-15"), rates);
    expect(out).toBeCloseTo(90, 2);
  });

  it("picks newer rate when asOf is after it", () => {
    const out = convertCentsWithRates(10000, "USD", "EUR", new Date("2026-06-25"), rates);
    expect(out).toBeCloseTo(92, 2);
  });

  it("throws AnalyticsError(FX_MISSING) when no rate exists", () => {
    expect(() =>
      convertCentsWithRates(10000, "USD", "JPY", new Date("2026-06-15"), rates),
    ).toThrow(/FX_MISSING/);
  });

  it("throws when only newer rates exist (no rate at or before asOf)", () => {
    expect(() =>
      convertCentsWithRates(10000, "USD", "EUR", new Date("2026-05-01"), rates),
    ).toThrow(/FX_MISSING/);
  });
});
