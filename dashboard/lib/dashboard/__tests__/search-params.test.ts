import { describe, it, expect } from "vitest";
import { parseDashboardSearchParams } from "../search-params";

describe("parseDashboardSearchParams", () => {
  it("returns defaults for empty input", () => {
    const p = parseDashboardSearchParams({});
    expect(p.range).toBe("daily");
    expect(p.storeId).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.from).toBeUndefined();
    expect(p.to).toBeUndefined();
  });

  it("accepts valid range / storeId / currency", () => {
    const p = parseDashboardSearchParams({
      range: "monthly",
      storeId: "42",
      currency: "eur",
    });
    expect(p.range).toBe("monthly");
    expect(p.storeId).toBe(42);
    expect(p.currency).toBe("EUR");
  });

  it("falls back to defaults on invalid values", () => {
    const p = parseDashboardSearchParams({
      range: "yearly",
      storeId: "abc",
      currency: "DOLLARS",
    });
    expect(p.range).toBe("daily");
    expect(p.storeId).toBeUndefined();
    expect(p.currency).toBeUndefined();
  });

  it("supports array-shaped query values (Next.js searchParams)", () => {
    const p = parseDashboardSearchParams({ range: ["weekly", "daily"] });
    expect(p.range).toBe("weekly");
  });
});
