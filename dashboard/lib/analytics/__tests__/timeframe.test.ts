import { describe, it, expect } from "vitest";
import { resolveWindow, buildDelta } from "../timeframe";

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
  it("computes percentage change and direction", () => {
    expect(buildDelta(120, 100)).toEqual({
      current: 120, previous: 100, changePct: 20, direction: "up",
    });
    expect(buildDelta(80, 100)).toEqual({
      current: 80, previous: 100, changePct: -20, direction: "down",
    });
  });
  it("returns flat with 0% when previous is 0", () => {
    expect(buildDelta(50, 0)).toEqual({
      current: 50, previous: 0, changePct: 0, direction: "flat",
    });
  });
  it("returns flat when current equals previous", () => {
    expect(buildDelta(100, 100).direction).toBe("flat");
  });
});
