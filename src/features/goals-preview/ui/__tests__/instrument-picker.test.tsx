import React from "react";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateMarket } from "../../data/market";
import { InstrumentPicker } from "../shared/InstrumentPicker";

describe("InstrumentPicker (ui/shared/InstrumentPicker.tsx)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("stock-directory")) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    hydrateMarket([]);
    vi.unstubAllGlobals();
  });

  it("search matches word prefixes of code or name ignoring diacritics ('ngan hang' finds a bank, 'a' does not match a name only containing 'quỹ đầu tư')", async () => {
    hydrateMarket([
      {
        id: "stock-vcb",
        kind: "stock",
        name: "VCB",
        fullName: "Ngân hàng TMCP Ngoại thương Việt Nam",
        unit: "cổ phiếu",
        fractional: false,
        priceSeries: [{ date: "2026-10-18", price: 90000 }],
      },
      {
        id: "stock-fpt",
        kind: "stock",
        name: "FPT",
        fullName: "Tập đoàn FPT",
        unit: "cổ phiếu",
        fractional: false,
        priceSeries: [{ date: "2026-10-18", price: 130000 }],
      },
    ]);

    const onChange = vi.fn();
    render(
      <InstrumentPicker
        kind="stock"
        value={undefined}
        onChange={onChange}
        today="2026-10-19"
      />,
    );

    // Open sheet
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên cổ phiếu/ }));
    });

    const searchInput = screen.getByRole("textbox", { name: "Tìm cổ phiếu" });

    // Search with "ngan hang" (no diacritics) -> matches "Ngân hàng TMCP Ngoại thương Việt Nam"
    act(() => {
      fireEvent.change(searchInput, { target: { value: "ngan hang" } });
    });

    expect(screen.getByText("VCB")).toBeInTheDocument();
    expect(screen.getByText("Ngân hàng TMCP Ngoại thương Việt Nam")).toBeInTheDocument();
    expect(screen.queryByText("FPT")).toBeNull();

    // Now test with fund picker and query "a"
    cleanup();
    hydrateMarket([
      {
        id: "fund-dcds",
        kind: "external_fund",
        name: "DCDS",
        fullName: "Quỹ đầu tư Doanh nghiệp Hàng đầu Việt Nam",
        unit: "CCQ",
        fractional: true,
        priceSeries: [{ date: "2026-10-18", price: 50000 }],
      },
    ]);

    render(
      <InstrumentPicker
        kind="external_fund"
        value={undefined}
        onChange={onChange}
        today="2026-10-19"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên quỹ/ }));
    const fundSearchInput = screen.getByRole("textbox", { name: "Tìm quỹ" });

    // "a" does not match words: [dcds, quy, dau, tu, doanh, nghiep, hang, dau, viet, nam]
    act(() => {
      fireEvent.change(fundSearchInput, { target: { value: "a" } });
    });

    expect(screen.queryByText("DCDS")).toBeNull();
  });

  it("the 'Thêm mã … kiểm tra trên sàn' row appears only when there are no results and the query looks like a code", async () => {
    hydrateMarket([
      {
        id: "stock-vcb",
        kind: "stock",
        name: "VCB",
        fullName: "Ngân hàng TMCP Ngoại thương",
        unit: "cổ phiếu",
        fractional: false,
        priceSeries: [{ date: "2026-10-18", price: 90000 }],
      },
    ]);

    render(
      <InstrumentPicker
        kind="stock"
        value={undefined}
        onChange={vi.fn()}
        today="2026-10-19"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên cổ phiếu/ }));
    });
    const searchInput = screen.getByRole("textbox", { name: "Tìm cổ phiếu" });

    // 1. Query "TCB" looks like code (2-10 chars, uppercase letters/digits) and has NO results
    act(() => {
      fireEvent.change(searchInput, { target: { value: "TCB" } });
    });
    expect(screen.getByRole("button", { name: /Thêm mã TCB — kiểm tra trên sàn/ })).toBeInTheDocument();

    // 2. Query "VCB" has results -> row does NOT appear
    act(() => {
      fireEvent.change(searchInput, { target: { value: "VCB" } });
    });
    expect(screen.queryByRole("button", { name: /Thêm mã VCB — kiểm tra trên sàn/ })).toBeNull();

    // 3. Query "a" does NOT look like a symbol (< 2 chars) -> row does NOT appear
    act(() => {
      fireEvent.change(searchInput, { target: { value: "a" } });
    });
    expect(screen.queryByRole("button", { name: /Thêm mã A — kiểm tra trên sàn/ })).toBeNull();

    // 4. Query with non-symbol characters e.g. "not a code" -> row does NOT appear
    act(() => {
      fireEvent.change(searchInput, { target: { value: "hello world" } });
    });
    expect(screen.queryByRole("button", { name: /Thêm mã/ })).toBeNull();
  });

  it("funds with listed: false are not listed", () => {
    hydrateMarket([
      {
        id: "fund-listed",
        kind: "external_fund",
        name: "FLIST",
        fullName: "Quỹ Đang Niêm Yết",
        unit: "CCQ",
        fractional: true,
        listed: true,
        priceSeries: [{ date: "2026-10-18", price: 20000 }],
      },
      {
        id: "fund-delisted",
        kind: "external_fund",
        name: "FDELIST",
        fullName: "Quỹ Hủy Niêm Yết",
        unit: "CCQ",
        fractional: true,
        listed: false,
        priceSeries: [{ date: "2026-10-18", price: 15000 }],
      },
    ]);

    render(
      <InstrumentPicker
        kind="external_fund"
        value={undefined}
        onChange={vi.fn()}
        today="2026-10-19"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên quỹ/ }));

    expect(screen.getByText("FLIST")).toBeInTheDocument();
    expect(screen.queryByText("FDELIST")).toBeNull();
  });

  it("typing keeps focus in the search input (focus is not moved to the close button)", async () => {
    hydrateMarket([
      {
        id: "stock-fpt",
        kind: "stock",
        name: "FPT",
        fullName: "Công ty Cổ phần FPT",
        unit: "cổ phiếu",
        fractional: false,
        priceSeries: [{ date: "2026-10-18", price: 130000 }],
      },
    ]);

    render(
      <InstrumentPicker
        kind="stock"
        value={undefined}
        onChange={vi.fn()}
        today="2026-10-19"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tìm mã hoặc tên cổ phiếu/ }));
    });
    const searchInput = screen.getByRole("textbox", { name: "Tìm cổ phiếu" });

    // Explicitly focus input
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    // Type into input
    act(() => {
      fireEvent.change(searchInput, { target: { value: "F" } });
    });
    expect(document.activeElement).toBe(searchInput);

    act(() => {
      fireEvent.change(searchInput, { target: { value: "FP" } });
    });
    expect(document.activeElement).toBe(searchInput);

    const closeBtn = within(screen.getByRole("dialog")).getByRole("button", { name: "Đóng" });
    expect(document.activeElement).not.toBe(closeBtn);
  });
});
