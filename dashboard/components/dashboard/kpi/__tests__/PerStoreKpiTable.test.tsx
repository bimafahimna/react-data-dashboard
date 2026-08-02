// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PerStoreKpiTable } from "../PerStoreKpiTable";
import type { PerStoreKpiRow } from "@/lib/analytics/types";

function makeRow(
  overrides: Partial<PerStoreKpiRow> & Pick<PerStoreKpiRow, "storeId" | "storeName">,
): PerStoreKpiRow {
  return {
    location: "Jakarta",
    baseCurrency: "USD",
    revenue: 0,
    orders: 0,
    uniqueCustomers: 0,
    aov: 0,
    newCustomers: 0,
    repeatCustomers: 0,
    itemsSold: 0,
    ...overrides,
  };
}

const rows: PerStoreKpiRow[] = [
  makeRow({
    storeId: 1,
    storeName: "Alpha",
    revenue: 500,
    orders: 5,
    uniqueCustomers: 4,
    aov: 100,
    newCustomers: 1,
    repeatCustomers: 3,
    itemsSold: 12,
  }),
  makeRow({
    storeId: 2,
    storeName: "Charlie",
    revenue: 3000,
    orders: 30,
    uniqueCustomers: 22,
    aov: 100,
    newCustomers: 5,
    repeatCustomers: 17,
    itemsSold: 80,
  }),
  makeRow({
    storeId: 3,
    storeName: "Bravo",
    // zero-activity store
  }),
];

function rowOrder(): string[] {
  const bodyRows = screen.getAllByRole("row").slice(1);
  return bodyRows.map((tr) => {
    const nameCell = tr.querySelector("td:first-child .font-medium");
    return nameCell?.textContent ?? "";
  });
}

describe("PerStoreKpiTable", () => {
  it("defaults to revenue-desc sort and marks Revenue header aria-sort=descending", () => {
    render(<PerStoreKpiTable rows={rows} currency="USD" />);
    expect(rowOrder()).toEqual(["Charlie", "Alpha", "Bravo"]);
    const revenueHeader = screen.getByRole("columnheader", { name: /Revenue/i });
    expect(revenueHeader.getAttribute("aria-sort")).toBe("descending");
  });

  it("toggles direction when the active column is clicked again", async () => {
    const user = userEvent.setup();
    render(<PerStoreKpiTable rows={rows} currency="USD" />);
    const revBtn = within(screen.getByRole("columnheader", { name: /Revenue/i })).getByRole("button");
    await user.click(revBtn);
    expect(rowOrder()).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(screen.getByRole("columnheader", { name: /Revenue/i }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("switches to a new column and defaults numeric columns to desc, text to asc", async () => {
    const user = userEvent.setup();
    render(<PerStoreKpiTable rows={rows} currency="USD" />);

    const storeBtn = within(screen.getByRole("columnheader", { name: /Store$/i })).getByRole("button");
    await user.click(storeBtn);
    expect(rowOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(screen.getByRole("columnheader", { name: /Store$/i }).getAttribute("aria-sort")).toBe(
      "ascending",
    );

    const ordersBtn = within(screen.getByRole("columnheader", { name: /Orders/i })).getByRole("button");
    await user.click(ordersBtn);
    expect(rowOrder()).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("renders em-dashes for zero-activity store rows but still shows them", () => {
    render(<PerStoreKpiTable rows={rows} currency="USD" />);
    const bravoRow = screen
      .getAllByRole("row")
      .find((tr) => within(tr).queryByText("Bravo"));
    expect(bravoRow).toBeTruthy();
    const dashes = within(bravoRow as HTMLElement).getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(7);
  });

  it("shows empty state with a link when no stores exist", () => {
    render(<PerStoreKpiTable rows={[]} currency="USD" />);
    expect(screen.getByText("No stores yet.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /create your first store/i });
    expect(link).toHaveAttribute("href", "/dashboard/stores");
  });
});
