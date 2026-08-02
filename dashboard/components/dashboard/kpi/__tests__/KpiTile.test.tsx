// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { KpiTile } from "../KpiTile";
import type { Delta } from "@/lib/analytics/types";

const upDelta: Delta = {
  current: 12345,
  previous: 10000,
  changeNominal: 2345,
  changePct: 23.45,
  direction: "up",
};
const yoyDown: Delta = {
  current: 12345,
  previous: 15000,
  changeNominal: -2655,
  changePct: -17.7,
  direction: "down",
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

describe("KpiTile", () => {
  it("renders value plus both delta chips with percent and nominal", () => {
    render(
      <KpiTile
        label="Revenue"
        value="$12,345"
        deltaPrev={upDelta}
        deltaYoy={yoyDown}
        formatNominal={money}
      />,
    );
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$12,345")).toBeInTheDocument();
    expect(screen.getByText(/\+23\.[45]%/)).toBeInTheDocument();
    expect(screen.getByText(/\+\$2,345/)).toBeInTheDocument();
    expect(screen.getByText(/-17\.[67]%/)).toBeInTheDocument();
    expect(screen.getByText(/vs prev/i)).toBeInTheDocument();
    expect(screen.getByText(/vs last year/i)).toBeInTheDocument();
  });

  it("marks the tile aria-label with both deltas in plain language", () => {
    render(
      <KpiTile
        label="Revenue"
        value="$12,345"
        deltaPrev={upDelta}
        deltaYoy={yoyDown}
        formatNominal={money}
      />,
    );
    const tile = screen.getByLabelText(/Revenue \$12,345/i);
    expect(tile.getAttribute("aria-label")).toMatch(/up 23\.[45] percent versus previous period/i);
    expect(tile.getAttribute("aria-label")).toMatch(/down 17\.[67] percent versus last year/i);
  });

  it("renders em-dash and hides delta chips when isEmpty", () => {
    render(
      <KpiTile
        label="Orders"
        value="0"
        isEmpty
        deltaPrev={upDelta}
        deltaYoy={yoyDown}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/vs prev/i)).toBeNull();
    expect(screen.queryByText(/vs last year/i)).toBeNull();
  });

  it("shows an em-dash chip when previous = 0", () => {
    const noBaseline: Delta = {
      current: 100,
      previous: 0,
      changeNominal: 100,
      changePct: 0,
      direction: "up",
    };
    render(
      <KpiTile
        label="New customers"
        value="100"
        deltaPrev={noBaseline}
        deltaYoy={noBaseline}
      />,
    );
    const chips = screen.getAllByText("—");
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });
});
