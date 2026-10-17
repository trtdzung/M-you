import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoachInput } from "../CoachInput";

describe("CoachInput", () => {
  it("composes multiline text and submits it once", () => {
    const submit = vi.fn();
    render(<CoachInput onSubmit={submit} />);
    const field = screen.getByRole("textbox", { name: "Mục tiêu bạn muốn đạt" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Gửi mục tiêu" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "Mua xe\nTrong ba năm" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gửi mục tiêu" }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("Mua xe\nTrong ba năm");
  });
  it("keeps the composer hidden on the manual tab", () => {
    const { rerender } = render(<CoachInput active={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    rerender(<CoachInput active onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mua xe" }));
    expect(screen.getByRole("textbox")).toHaveValue("Tôi muốn tiết kiệm cho mua xe");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});
