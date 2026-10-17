import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { type RenderOptions, render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import { CATEGORIES, type Jar } from "@/domain/models";
import { KHAC_JAR_ID, KHAC_JAR_LABEL } from "@/domain/engine";
import { HuCategoryPicker } from "../HuCategoryPicker";


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

/**
 * `HuCategoryPicker` is a CONTROLLED, purely presentational list: it lists every
 * expense category, marks the ones in `selected` (the editor's unsaved draft) and
 * reports ownership of the rest. A tap only calls `onChange` with the FULL desired
 * `categoryIds` — it never writes; `HuEditorSheet` holds the draft and saves it in
 * one PATCH when the sheet closes (covered separately, with real mutations).
 */

const EXPENSE_LABELS = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.label);

// Mirrors the seed shapes (`jar-defaults.ts`) so labels read naturally: "food"
// owns dining + groceries ("Ăn uống"/"Nhu yếu phẩm"), "transport" owns
// "transport" ("Di chuyển"). "housing" is deliberately left unclaimed by
// either jar (orphan) to exercise the "Chưa xếp hũ" fallback.
const foodJar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] };
const transportJar: Jar = { id: "transport", label: "Di chuyển", categoryIds: ["transport"] };
const normalJars: Jar[] = [foodJar, transportJar];

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
});

describe("HuCategoryPicker — full expense taxonomy listing", () => {
  it("lists every expense category exactly once and never the transfer category", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    expect(EXPENSE_LABELS).toHaveLength(10);
    for (const label of EXPENSE_LABELS) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.queryByText("Chuyển khoản")).not.toBeInTheDocument();
  });
});

describe("HuCategoryPicker — ownership state (aria-pressed + label)", () => {
  it("marks the jar's own categories aria-pressed=true with no ownership label", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const row = screen.getByRole("button", { name: "Ăn uống" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(within(row).queryByText(/đang ở/)).not.toBeInTheDocument();
  });

  it("marks a category owned by another jar aria-pressed=false and shows 'đang ở <label>'", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const row = screen.getByRole("button", { name: /Di chuyển/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText("đang ở Di chuyển")).toBeInTheDocument();
  });

  it("falls back to 'Chưa xếp hũ' for an orphan category no jar in `jars` claims", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const row = screen.getByRole("button", { name: /Nhà ở/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText(`đang ở ${KHAC_JAR_LABEL}`)).toBeInTheDocument();
  });
});

describe("HuCategoryPicker — click wiring (single onChange door)", () => {
  it("tapping an unchecked row calls onChange with the existing ids plus the tapped id", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Di chuyển/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["dining", "groceries", "transport"]);
  });

  it("tapping a checked row calls onChange with that id removed, others preserved in order", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["groceries"]);
  });
});

/** Holds the draft like `HuEditorSheet` does, so taps accumulate across renders. */
function Draft({ jar, jars }: { jar: Jar; jars: Jar[] }) {
  const [selected, setSelected] = useState<string[]>(jar.categoryIds);
  return <HuCategoryPicker jar={jar} jars={jars} selected={selected} onChange={setSelected} />;
}

describe("HuCategoryPicker — a draft, nothing is saved by a tap", () => {
  it("picking a category owned by another jar labels it 'lấy từ <hũ>'; unpicking restores 'đang ở <hũ>' — it never falls to 'Chưa xếp hũ'", () => {
    render(<Draft jar={foodJar} jars={normalJars} />);
    const row = screen.getByRole("button", { name: /Di chuyển/ });
    expect(within(row).getByText("đang ở Di chuyển")).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(within(row).getByText("lấy từ Di chuyển")).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText("đang ở Di chuyển")).toBeInTheDocument();
    expect(within(row).queryByText(`đang ở ${KHAC_JAR_LABEL}`)).not.toBeInTheDocument();
  });

  it("unchecking the jar's OWN category reads 'đang ở Chưa xếp hũ' (pending) and re-checking undoes it", () => {
    render(<Draft jar={foodJar} jars={normalJars} />);
    const row = screen.getByRole("button", { name: "Ăn uống" });
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText(`đang ở ${KHAC_JAR_LABEL}`)).toBeInTheDocument();
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
  });

  it("rapid taps accumulate on the draft (each onChange derives from the latest selection)", () => {
    const dietJar: Jar = { id: "diet", label: "Ăn uống", categoryIds: ["dining"] };
    render(<Draft jar={dietJar} jars={[dietJar]} />);
    const transport = screen.getByRole("button", { name: /Di chuyển/ });
    const shopping = screen.getByRole("button", { name: /Mua sắm/ });
    fireEvent.click(transport);
    fireEvent.click(shopping);
    expect(transport).toHaveAttribute("aria-pressed", "true");
    expect(shopping).toHaveAttribute("aria-pressed", "true");
  });
});

describe("HuCategoryPicker — search (F6)", () => {
  it("filters by label, diacritic- and case-insensitive", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const input = screen.getByLabelText("Tìm danh mục");

    fireEvent.change(input, { target: { value: "an uong" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "DI CHUYEN" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Di chuyển")).toBeInTheDocument();
  });

  it("shows an empty-state line quoting the query when nothing matches", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const input = screen.getByLabelText("Tìm danh mục");
    fireEvent.change(input, { target: { value: "zzz-khong-ton-tai" } });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Không có danh mục nào khớp “zzz-khong-ton-tai”.")).toBeInTheDocument();
  });

  it("clearing the query restores all 10 rows", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    const input = screen.getByLabelText("Tìm danh mục");
    fireEvent.change(input, { target: { value: "an uong" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});

describe("HuCategoryPicker — a legacy stored jar with the reserved 'khac' id is an ordinary jar", () => {
  // "housing" is owned by the legacy jar under test; "dining" is owned by a
  // separate normal jar. Deliberately a single-category jar (unlike `foodJar`) so
  // its "đang ở Ăn uống" label can't also match "groceries".
  const khacJar: Jar = { id: KHAC_JAR_ID, label: KHAC_JAR_LABEL, categoryIds: ["housing"] };
  const dietJar: Jar = { id: "diet", label: "Ăn uống", categoryIds: ["dining"] };
  const khacJars: Jar[] = [khacJar, dietJar];

  it("an owned row is a normal toggle — a tap unassigns it (no locked cells any more)", () => {
    render(<HuCategoryPicker jar={khacJar} jars={khacJars} selected={khacJar.categoryIds} onChange={onChange} />);
    const row = screen.getByRole("button", { name: "Nhà ở" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("keeps a not-owned row clickable and calls onChange with the id appended", () => {
    render(<HuCategoryPicker jar={khacJar} jars={khacJars} selected={khacJar.categoryIds} onChange={onChange} />);
    const row = screen.getByRole("button", { name: /Ăn uống/ });
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["housing", "dining"]);
  });

});

describe("HuCategoryPicker — helper copy for a normal jar", () => {
  it("says a category belongs to at most one jar, unchecking leaves it unassigned, and changes save on close", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} selected={foodJar.categoryIds} onChange={onChange} />);
    expect(
      screen.getByText(/Mỗi danh mục thuộc tối đa một hũ — bỏ chọn sẽ thành “Chưa xếp hũ”.*bấm Đóng/),
    ).toBeInTheDocument();
  });
});
