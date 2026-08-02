import { describe, it, expect } from "vitest";
import { resolveWindow, buildDelta, shiftYearsUtc } from "../timeframe";

describe("resolveWindow", () => {
  const now = new Date(Date.UTC(2026, 5, 29, 12, 0, 0)); // Mon Jun 29 2026 12:00 UTC

  it("daily: returns last 7 days [from, to) ending at start-of-tomorrow UTC", () => {
    const w = resolveWindow("daily", undefined, undefined, now);
    expect(w.bucket).toBe("day");
    expect(w.to.toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-06-23T00:00:00.000Z");
    expect(w.previousFrom.toISOString()).toBe("2026-06-16T00:00:00.000Z");
    expect(w.previousTo.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });

  it("weekly: returns last 8 weeks ending on next Monday UTC", () => {
    const w = resolveWindow("weekly", undefined, undefined, now);
    expect(w.bucket).toBe("week");
    expect(w.to.toISOString()).toBe("2026-07-06T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-05-11T00:00:00.000Z");
  });

  it("monthly: returns last 6 months ending at start of next month UTC", () => {
    const w = resolveWindow("monthly", undefined, undefined, now);
    expect(w.bucket).toBe("month");
    expect(w.to.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("respects explicit from/to and computes equal-length previous window", () => {
    const w = resolveWindow(
      "daily",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
      now,
    );
    expect(w.from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(w.previousTo.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(w.previousFrom.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("ignores malformed from/to and falls back to range default", () => {
    const w = resolveWindow("daily", "not-a-date", "also-bad", now);
    expect(w.from.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
});

describe("buildDelta", () => {
  it("computes percentage change, nominal delta, and direction (up)", () => {
    expect(buildDelta(120, 100)).toEqual({
      current: 120,
      previous: 100,
      changeNominal: 20,
      changePct: 20,
      direction: "up",
    });
  });

  it("computes percentage change, nominal delta, and direction (down)", () => {
    expect(buildDelta(80, 100)).toEqual({
      current: 80,
      previous: 100,
      changeNominal: -20,
      changePct: -20,
      direction: "down",
    });
  });

  it("reports up direction with 0% when previous is 0 and current is positive", () => {
    expect(buildDelta(50, 0)).toEqual({
      current: 50,
      previous: 0,
      changeNominal: 50,
      changePct: 0,
      direction: "up",
    });
  });

  it("reports down direction with 0% when previous is 0 and current is negative", () => {
    expect(buildDelta(-25, 0)).toEqual({
      current: -25,
      previous: 0,
      changeNominal: -25,
      changePct: 0,
      direction: "down",
    });
  });

  it("returns flat when current equals previous (both non-zero)", () => {
    expect(buildDelta(100, 100)).toEqual({
      current: 100,
      previous: 100,
      changeNominal: 0,
      changePct: 0,
      direction: "flat",
    });
  });

  it("returns flat when both current and previous are 0", () => {
    expect(buildDelta(0, 0)).toEqual({
      current: 0,
      previous: 0,
      changeNominal: 0,
      changePct: 0,
      direction: "flat",
    });
  });
});

describe("shiftYearsUtc", () => {
  it("shifts a normal date back by one year", () => {
    const d = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
    expect(shiftYearsUtc(d, -1).toISOString()).toBe("2025-06-15T00:00:00.000Z");
  });

  it("clamps Feb 29 to Feb 28 when shifting to a non-leap year", () => {
    const d = new Date(Date.UTC(2028, 1, 29, 0, 0, 0));
    expect(shiftYearsUtc(d, -1).toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("preserves UTC hours/minutes/seconds/ms", () => {
    const d = new Date(Date.UTC(2026, 5, 15, 14, 27, 33, 456));
    expect(shiftYearsUtc(d, -1).toISOString()).toBe("2025-06-15T14:27:33.456Z");
  });

  it("supports positive year shifts", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(shiftYearsUtc(d, 2).toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });
});
