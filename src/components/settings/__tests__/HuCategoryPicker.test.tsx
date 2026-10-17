import { describe, expect, it, vi, beforeEach } from "vitest";
import { type RenderOptions, render as rtlRender, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
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
 * `HuCategoryPicker` is purely presentational plus a local optimistic `draft`
 * (no provider/context deps): it lists every expense category, marks the ones
 * this jar owns, and reports ownership of the rest. A single write door —
 * `onCommit` receives the jar's FULL desired `categoryIds` after the tap and
 * resolves `true`/`false`; `HuEditorSheet` PATCHes that array (via
 * `nextCategoryPatch`) in one request. These tests exercise the component
 * directly with hand-built `Jar` fixtures and a controllable ("deferred")
 * `onCommit` — the wiring into `HuEditorSheet` (real mutations, live count,
 * accent pinning on the wire) is covered separately.
 */

const EXPENSE_LABELS = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.label);

// Mirrors the seed shapes (`jar-defaults.ts`) so labels read naturally: "food"
// owns dining + groceries ("Ăn uống"/"Nhu yếu phẩm"), "transport" owns
// "transport" ("Di chuyển"). "housing" is deliberately left unclaimed by
// either jar (orphan) to exercise the "Khác" fallback.
const foodJar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], role: "spending" };
const transportJar: Jar = { id: "transport", label: "Di chuyển", categoryIds: ["transport"], role: "spending" };
const normalJars: Jar[] = [foodJar, transportJar];

/** A controllable promise: resolve it whenever the test decides to. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let onCommit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // A never-resolving promise by default: most tests below only assert the
  // call args or synchronous DOM state and don't care about settlement — an
  // already-resolved mock would schedule a stray post-test microtask/render
  // ("not wrapped in act"). Tests that DO care about resolution (optimistic
  // flip, refused write, race/stale ordering) install their own `deferred()`.
  onCommit = vi.fn().mockReturnValue(new Promise<boolean>(() => {}));
});

describe("HuCategoryPicker — full expense taxonomy listing", () => {
  it("lists every expense category exactly once and never the transfer category", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    expect(EXPENSE_LABELS).toHaveLength(10);
    for (const label of EXPENSE_LABELS) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.queryByText("Chuyển khoản")).not.toBeInTheDocument();
  });
});

describe("HuCategoryPicker — ownership state (aria-pressed + label)", () => {
  it("marks the jar's own categories aria-pressed=true with no ownership label", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const row = screen.getByRole("button", { name: "Ăn uống" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(within(row).queryByText(/đang ở/)).not.toBeInTheDocument();
  });

  it("marks a category owned by another jar aria-pressed=false and shows 'đang ở <label>'", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const row = screen.getByRole("button", { name: /Di chuyển/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText("đang ở Di chuyển")).toBeInTheDocument();
  });

  it("falls back to 'Khác' for an orphan category no jar in `jars` claims", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const row = screen.getByRole("button", { name: /Nhà ở/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText(`đang ở ${KHAC_JAR_LABEL}`)).toBeInTheDocument();
  });
});

describe("HuCategoryPicker — click wiring (single onCommit door)", () => {
  it("tapping an unchecked row calls onCommit with the existing ids plus the tapped id", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: /Di chuyển/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(["dining", "groceries", "transport"]);
  });

  it("tapping a checked row calls onCommit with that id removed, others preserved in order", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(["groceries"]);
  });
});

describe("HuCategoryPicker — optimistic draft", () => {
  it("flips aria-pressed immediately, before onCommit's promise resolves", async () => {
    const commit = deferred<boolean>();
    onCommit.mockReturnValue(commit.promise);
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);

    const row = screen.getByRole("button", { name: /Di chuyển/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row);
    // No await yet — onCommit is still pending — the flip must already be visible.
    expect(row).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      commit.resolve(true);
      await commit.promise;
    });
  });

  it("a refused write (onCommit resolves false) drops the overlay and the row snaps back", async () => {
    const commit = deferred<boolean>();
    onCommit.mockReturnValue(commit.promise);
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);

    const row = screen.getByRole("button", { name: /Di chuyển/ });
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      commit.resolve(false);
      await commit.promise;
    });
    await waitFor(() => expect(row).toHaveAttribute("aria-pressed", "false"));
  });
});

describe("HuCategoryPicker — read-modify-write race (regression)", () => {
  // "diet" owns only "dining" so the math is unambiguous: tap "transport" then
  // "shopping" and the SECOND call must derive from the draft left by the
  // first tap, not from the (stale) `jar.categoryIds` prop.
  const dietJar: Jar = { id: "diet", label: "Ăn uống", categoryIds: ["dining"] };

  it("two rapid taps both survive: the second call includes both new ids", () => {
    const c1 = deferred<boolean>();
    const c2 = deferred<boolean>();
    onCommit.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise);
    render(<HuCategoryPicker jar={dietJar} jars={[dietJar]} onCommit={onCommit} />);

    fireEvent.click(screen.getByRole("button", { name: /Di chuyển/ })); // transport
    fireEvent.click(screen.getByRole("button", { name: /Mua sắm/ })); // shopping

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenNthCalledWith(1, ["dining", "transport"]);
    // Regression: without the draft fix this would be ["dining", "shopping"]
    // (derived from the stale pre-tap-1 `jar.categoryIds`).
    expect(onCommit).toHaveBeenNthCalledWith(2, ["dining", "transport", "shopping"]);
  });

  it("stale resolution: an earlier onCommit settling after a later tap does not clear the newer overlay", async () => {
    const c1 = deferred<boolean>();
    const c2 = deferred<boolean>();
    onCommit.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise);
    render(<HuCategoryPicker jar={dietJar} jars={[dietJar]} onCommit={onCommit} />);

    const transportRow = screen.getByRole("button", { name: /Di chuyển/ });
    const shoppingRow = screen.getByRole("button", { name: /Mua sắm/ });
    fireEvent.click(transportRow);
    fireEvent.click(shoppingRow);
    expect(transportRow).toHaveAttribute("aria-pressed", "true");
    expect(shoppingRow).toHaveAttribute("aria-pressed", "true");

    // Resolve the FIRST (older) call only — its sequence number is stale, so
    // it must NOT clear the overlay left by the second tap.
    await act(async () => {
      c1.resolve(true);
      await c1.promise;
    });
    expect(transportRow).toHaveAttribute("aria-pressed", "true");
    expect(shoppingRow).toHaveAttribute("aria-pressed", "true");

    // Resolving the LATEST call is what clears the overlay (falls back to the
    // static `jar` prop in this isolated render, which never gained the taps).
    await act(async () => {
      c2.resolve(true);
      await c2.promise;
    });
    await waitFor(() => expect(transportRow).toHaveAttribute("aria-pressed", "false"));
    expect(shoppingRow).toHaveAttribute("aria-pressed", "false");
  });
});

describe("HuCategoryPicker — search (F6)", () => {
  it("filters by label, diacritic- and case-insensitive", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const input = screen.getByLabelText("Tìm danh mục");

    fireEvent.change(input, { target: { value: "an uong" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "DI CHUYEN" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Di chuyển")).toBeInTheDocument();
  });

  it("shows an empty-state line quoting the query when nothing matches", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const input = screen.getByLabelText("Tìm danh mục");
    fireEvent.change(input, { target: { value: "zzz-khong-ton-tai" } });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Không có danh mục nào khớp “zzz-khong-ton-tai”.")).toBeInTheDocument();
  });

  it("clearing the query restores all 10 rows", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    const input = screen.getByLabelText("Tìm danh mục");
    fireEvent.change(input, { target: { value: "an uong" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});

describe("HuCategoryPicker — inside the 'Khác' jar itself", () => {
  // "housing" is owned by the Khác jar under test; "dining" is owned by a
  // separate normal jar (unowned by Khác). Deliberately a single-category jar
  // (unlike `foodJar`) so its "đang ở Ăn uống" label can't also match "groceries".
  const khacJar: Jar = { id: KHAC_JAR_ID, label: KHAC_JAR_LABEL, categoryIds: ["housing"] };
  const dietJar: Jar = { id: "diet", label: "Ăn uống", categoryIds: ["dining"] };
  const khacJars: Jar[] = [khacJar, dietJar];

  it("disables an owned row (no self-move) and a tap never calls onCommit", () => {
    render(<HuCategoryPicker jar={khacJar} jars={khacJars} onCommit={onCommit} />);
    const row = screen.getByRole("button", { name: "Nhà ở" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps a not-owned row clickable and calls onCommit with the id appended", () => {
    render(<HuCategoryPicker jar={khacJar} jars={khacJars} onCommit={onCommit} />);
    const row = screen.getByRole("button", { name: /Ăn uống/ });
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(["housing", "dining"]);
  });

  it("shows the 'Khác'-specific helper copy", () => {
    render(<HuCategoryPicker jar={khacJar} jars={khacJars} onCommit={onCommit} />);
    expect(
      screen.getByText(
        `Mỗi danh mục luôn thuộc đúng một hũ. Danh mục ở “${KHAC_JAR_LABEL}” là những danh mục chưa được xếp hũ — mở hũ đích rồi chọn nó ở đó.`,
      ),
    ).toBeInTheDocument();
  });
});

describe("HuCategoryPicker — helper copy for a normal jar", () => {
  it("shows the normal-jar helper copy (distinct from the 'Khác' copy)", () => {
    render(<HuCategoryPicker jar={foodJar} jars={normalJars} onCommit={onCommit} />);
    expect(
      screen.getByText(`Mỗi danh mục luôn thuộc đúng một hũ — bỏ chọn sẽ chuyển về “${KHAC_JAR_LABEL}”.`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/là những danh mục chưa được xếp hũ/)).not.toBeInTheDocument();
  });
});
