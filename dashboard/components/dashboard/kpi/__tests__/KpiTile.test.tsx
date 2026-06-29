// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { KpiTile } from "../KpiTile";

describe("KpiTile", () => {
  it("renders value and up-delta", () => {
    render(
      <KpiTile
        label="Revenue"
        value={12345}
        delta={{ current: 12345, previous: 10000, changePct: 23.45, direction: "up" }}
        format={{ kind: "currency", currency: "USD" }}
      />,
    );
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$12,345")).toBeInTheDocument();
    expect(screen.getByText(/\+23\.[45]%/)).toBeInTheDocument();
  });

  it("renders em-dash and hides delta when empty", () => {
    render(
      <KpiTile
        label="Orders"
        value={0}
        delta={{ current: 0, previous: 0, changePct: 0, direction: "flat" }}
        format={{ kind: "integer", emptyWhenZero: true }}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
