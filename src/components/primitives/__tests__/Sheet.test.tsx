import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Sheet } from "../Sheet";

describe("Sheet", () => {
  it("moves focus into the sheet, closes on Escape, and restores the opener", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<button type="button">Mở sheet</button>);
    const opener = screen.getByRole("button", { name: "Mở sheet" });
    opener.focus();
    rerender(
      <>
        <button type="button">Mở sheet</button>
        <Sheet title="Báo cáo tháng" onClose={onClose}>
          <button type="button">Tiếp tục</button>
        </Sheet>
      </>,
    );
    const closeButton = within(screen.getByRole("dialog", { name: "Báo cáo tháng" })).getByRole("button", { name: "Đóng" });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <>
        <button type="button">Mở sheet</button>
        <Sheet title="Báo cáo tháng" onClose={onClose} open={false}>
          <button type="button">Tiếp tục</button>
        </Sheet>
      </>,
    );
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside the sheet", () => {
    render(
      <Sheet title="Bộ lọc" onClose={() => {}}>
        <button type="button">Hủy</button>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Bộ lọc" });
    const buttons = within(dialog).getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
  });
});
