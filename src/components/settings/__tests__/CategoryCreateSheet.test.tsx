import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import { CATEGORIES, type StoredCategory } from "@/domain/models";
import { slugCategoryId } from "@/domain/models/category-rules";
import { categoryColor } from "@/lib/category-colors";
import { CategoryCreateSheet } from "../CategoryCreateSheet";

/**
 * `CategoryCreateSheet` against a STUBBED taxonomy: the sheet owns no data, it
 * owns a form and one call to `addCategory`. Driving the real fetching provider
 * here would only turn every assertion into a `waitFor` without testing more —
 * the provider is covered by `state/__tests__/categories.test.tsx`.
 *
 * What these pin: the sheet never issues a request it can already tell will be
 * refused, ALWAYS handles the server's refusal even when its own check passed
 * (the taxonomy in hand can be stale), and previews the hue of the id the SERVER
 * will generate rather than a colour of its own.
 */

const onClose = vi.fn();
let addCategory: ReturnType<typeof vi.fn>;

function wrap(children: ReactNode, rest: Record<string, unknown> = {}, categories?: StoredCategory[]) {
  return render(
    <StubCategoryTaxonomy categories={categories} addCategory={addCategory} {...rest}>
      {children}
    </StubCategoryTaxonomy>,
  );
}

const nameInput = () => screen.getByLabelText("Tên danh mục") as HTMLInputElement;
const submitButton = () => screen.getByRole("button", { name: "Tạo danh mục" });

beforeEach(() => {
  onClose.mockClear();
  addCategory = vi.fn().mockResolvedValue(true);
});

describe("CategoryCreateSheet — the label field", () => {
  it("keeps submit disabled for an empty or whitespace-only label and caps the input at 40", async () => {
    wrap(<CategoryCreateSheet onClose={onClose} />);
    await screen.findByRole("dialog");

    expect(submitButton()).toBeDisabled();
    expect(nameInput()).toHaveAttribute("maxLength", "40");

    fireEvent.change(nameInput(), { target: { value: "   " } });
    expect(submitButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "Học phí" } });
    expect(submitButton()).toBeEnabled();
  });

  it("refuses a label that already exists WITHOUT issuing a request", async () => {
    wrap(<CategoryCreateSheet onClose={onClose} />);
    await screen.findByRole("dialog");

    // Case-folded clash with the preset "Ăn uống" — the same rule the server runs.
    fireEvent.change(nameInput(), { target: { value: "ăn uống" } });
    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Tên danh mục đã tồn tại");
    expect(addCategory).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CategoryCreateSheet — the server is the authority", () => {
  it("shows the server's refusal inline, keeps the sheet open and keeps the typed text", async () => {
    // The client check passes (no such label locally) but the server still says
    // 409 — a stale taxonomy, a second tab. The sheet must not close on it.
    addCategory = vi.fn().mockResolvedValue(false);
    wrap(<CategoryCreateSheet onClose={onClose} />, {
      mutationError: "Tên danh mục đã tồn tại. Hãy chọn tên khác.",
    });
    await screen.findByRole("dialog");

    fireEvent.change(nameInput(), { target: { value: "Học phí" } });
    // Before the attempt the provider's leftover message is NOT this sheet's.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Tên danh mục đã tồn tại");
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput().value).toBe("Học phí");
  });
});

describe("CategoryCreateSheet — what goes on the wire", () => {
  it("sends `fixed` with the label, and the jarId when the sheet was opened from a hũ", async () => {
    wrap(<CategoryCreateSheet jarId="food" jarLabel="Ăn uống" onClose={onClose} />);
    await screen.findByRole("dialog");

    fireEvent.change(nameInput(), { target: { value: "Học phí" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submitButton());

    await waitFor(() => expect(addCategory).toHaveBeenCalledTimes(1));
    expect(addCategory).toHaveBeenCalledWith({ label: "Học phí", fixed: true, jarId: "food" });
    // Created into a hũ: the row behind is already checked, so the sheet closes
    // instead of announcing where it landed.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("previews the hue of the id the SERVER will generate for that label", async () => {
    wrap(<CategoryCreateSheet onClose={onClose} />);
    await screen.findByRole("dialog");

    fireEvent.change(nameInput(), { target: { value: "Học phí" } });

    const expectedId = slugCategoryId("Học phí");
    expect(expectedId).toBe("c_hoc-phi");
    expect(screen.getByTestId("category-hue-preview")).toHaveStyle({
      background: categoryColor(expectedId),
    });
  });
});

describe("CategoryCreateSheet — created without a hũ", () => {
  it("says where the category landed and hands the REAL id back on Xong", async () => {
    const created: StoredCategory = { id: "c_hoc-phi", label: "Học phí", kind: "expense", fixed: false };
    const onCreated = vi.fn();
    // The provider applies the write, so the next render sees the new row — the
    // sheet resolves the id from the taxonomy instead of guessing one.
    const { rerender } = wrap(<CategoryCreateSheet onCreated={onCreated} onClose={onClose} />);
    await screen.findByRole("dialog");

    fireEvent.change(nameInput(), { target: { value: "Học phí" } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(addCategory).toHaveBeenCalled());
    expect(addCategory).toHaveBeenCalledWith({ label: "Học phí", fixed: false, jarId: undefined });

    rerender(
      <StubCategoryTaxonomy
        categories={[...CATEGORIES.map((c) => ({ ...c }) as StoredCategory), created]}
        addCategory={addCategory}
      >
        <CategoryCreateSheet onCreated={onCreated} onClose={onClose} />
      </StubCategoryTaxonomy>,
    );

    expect(await screen.findByText(/Danh mục đang ở “Chưa xếp hũ”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(onCreated).toHaveBeenCalledWith("c_hoc-phi");
    expect(onClose).toHaveBeenCalled();
  });
});
