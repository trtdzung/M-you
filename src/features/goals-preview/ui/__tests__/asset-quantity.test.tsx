import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseQtyInput, formatQtyInput, AddAsset } from "../screens/assets/AddAsset";
import { hydrateMarket } from "../../data/market";
import { stateFromScenario } from "../../store/reducer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/goals",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/providers/context", () => ({
  usePersonaCif: () => "CIF_0001",
}));

vi.mock("@/components/shell/PanelActive", () => ({
  usePanelActive: () => true,
}));

import { PreviewStoreProvider } from "../../store/PreviewStore";

describe("Asset quantity input — parseQtyInput, formatQtyInput and AddAsset screen", () => {
  describe("pure helpers: parseQtyInput & formatQtyInput", () => {
    it("formatQtyInput uses Vietnamese thousands and decimal separators", () => {
      expect(formatQtyInput("1500")).toBe("1.500");
      expect(formatQtyInput("1234.5")).toBe("1.234,5");
    });

    it("fractional units use commas for decimals and cap them at 2 digits", () => {
      expect(parseQtyInput("1,", true)).toBe("1.");
      expect(parseQtyInput("1,5", true)).toBe("1.5");
      expect(parseQtyInput("1,567", true)).toBe("1.56");
      expect(parseQtyInput("12,3456", true)).toBe("12.34");
      expect(parseQtyInput("1.234,5", true)).toBe("1234.5");
      expect(parseQtyInput("1.567", true)).toBe("1567");
      expect(formatQtyInput(parseQtyInput("1,", true))).toBe("1,");
      expect(formatQtyInput(parseQtyInput("1,5", true))).toBe("1,5");
      expect(formatQtyInput(parseQtyInput("1,567", true))).toBe("1,56");
    });

    it("whole-share stocks ignore '.'", () => {
      // Dot is ignored/stripped for non-fractional
      expect(parseQtyInput("1.5", false)).toBe("15");
      expect(parseQtyInput("1.500", false)).toBe("1500");
      expect(parseQtyInput("1500", false)).toBe("1500");
      expect(parseQtyInput("1500.5", false)).toBe("15005");
      expect(parseQtyInput("1,500", false)).toBe("1500");
    });
  });

  describe("AddAsset component quantity field", () => {
    beforeEach(() => {
      const world = stateFromScenario("s01-car-feasible");
      const instruments = [
        {
          id: "stock-fpt",
          kind: "stock",
          name: "FPT",
          fullName: "Công ty Cổ phần FPT",
          unit: "cổ phiếu",
          fractional: false,
          priceSeries: [{ date: "2026-10-18", price: 130000 }],
        },
        {
          id: "gold-sjc",
          kind: "gold",
          name: "Vàng miếng SJC",
          unit: "chỉ",
          fractional: true,
          priceSeries: [{ date: "2026-10-18", price: 8500000 }],
        },
      ] satisfies Parameters<typeof hydrateMarket>[0];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          if (String(url).includes("suggestions")) {
            return new Response(JSON.stringify({ suggestions: [], refreshing: false }));
          }
          if (String(url).includes("stock-directory")) {
            return new Response(JSON.stringify({ items: [] }));
          }
          return new Response(
            JSON.stringify({
              world: { ...world, customer: { ...world.customer, cif: "CIF_0001" } },
              market: { instruments, refreshing: false, asOf: null },
            }),
          );
        }),
      );
    });

    afterEach(() => {
      cleanup();
      hydrateMarket([]);
      vi.unstubAllGlobals();
    });

    it("whole-share stock input ignores '.' and groups '1500'", async () => {
      render(
        <PreviewStoreProvider>
          <AddAsset params={{ goalId: stateFromScenario("s01-car-feasible").goals[0].id }} />
        </PreviewStoreProvider>,
      );

      // Select Cổ phiếu (stock)
      const stockBtn = await screen.findByRole("button", { name: "Cổ phiếu" });
      fireEvent.click(stockBtn);

      // Select instrument FPT
      fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên cổ phiếu/ }));
      fireEvent.click(screen.getByRole("button", { name: /FPT/ }));

      const qtyInput = screen.getByRole("textbox", { name: "Số lượng nắm giữ" }) as HTMLInputElement;

      // Type "1500"
      act(() => {
        fireEvent.change(qtyInput, { target: { value: "1500" } });
      });
      expect(qtyInput.value).toBe("1.500");

      // Type "1.5" -> whole share stock ignores "."
      act(() => {
        fireEvent.change(qtyInput, { target: { value: "1.5" } });
      });
      expect(qtyInput.value).toBe("15");
    });

    it("fractional unit (gold) handles '1,' and caps decimals at 2", async () => {
      render(
        <PreviewStoreProvider>
          <AddAsset params={{ goalId: stateFromScenario("s01-car-feasible").goals[0].id }} />
        </PreviewStoreProvider>,
      );

      // Select Vàng (gold, fractional: true)
      const goldBtn = await screen.findByRole("button", { name: "Vàng" });
      fireEvent.click(goldBtn);

      // Select Vàng miếng SJC chip
      fireEvent.click(screen.getByRole("button", { name: /Vàng miếng SJC/ }));

      const qtyInput = screen.getByRole("textbox", { name: "Số lượng nắm giữ" }) as HTMLInputElement;

      // Type "1," -> becomes "1." parsed, displayed as "1,"
      act(() => {
        fireEvent.change(qtyInput, { target: { value: "1," } });
      });
      expect(qtyInput.value).toBe("1,");

      // Comma is the decimal separator; preserve a single decimal while typing.
      fireEvent.change(qtyInput, { target: { value: "1,5" } });
      expect(qtyInput.value).toBe("1,5");

      // Type "1,567" -> raw "1.56", displayed as "1,56"
      act(() => {
        fireEvent.change(qtyInput, { target: { value: "1,567" } });
      });
      expect(qtyInput.value).toBe("1,56");
    });
  });
});
