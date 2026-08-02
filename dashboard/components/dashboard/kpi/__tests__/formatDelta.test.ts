// components/dashboard/kpi/__tests__/formatDelta.test.ts
import { describe, it, expect } from "vitest";
import { formatDelta, formatKpiValue } from "../formatDelta";

describe("formatDelta", () => {
  it("formats up delta with +", () => {
    expect(
      formatDelta({ current: 120, previous: 100, changeNominal: 20, changePct: 20, direction: "up" }),
    ).toEqual({ text: "+20.0%", tone: "up" });
  });
  it("formats down delta", () => {
    expect(
      formatDelta({ current: 80, previous: 100, changeNominal: -20, changePct: -20, direction: "down" }),
    ).toEqual({ text: "-20.0%", tone: "down" });
  });
  it("hides delta when previous = 0", () => {
    expect(
      formatDelta({ current: 50, previous: 0, changeNominal: 50, changePct: 0, direction: "flat" }),
    ).toBeNull();
  });
});

describe("formatKpiValue", () => {
  it("formats currency in USD", () => {
    expect(formatKpiValue(1234.5, { kind: "currency", currency: "USD" }))
      .toBe("$1,235");
  });
  it("formats integer count with thousands sep", () => {
    expect(formatKpiValue(12345, { kind: "integer" })).toBe("12,345");
  });
  it("returns em-dash for empty mode", () => {
    expect(formatKpiValue(0, { kind: "integer", emptyWhenZero: true })).toBe("—");
  });
});
