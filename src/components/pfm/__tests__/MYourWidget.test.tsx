import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MYourWidget } from "../MYourWidget";

/**
 * The floating M-Your chat button lives on every /pfm screen (mounted via the
 * PhoneShell `fab` slot). It is a self-contained, UI-only mock chat — no
 * assistant backend wired yet — so these tests only cover open/close, sending
 * a message, and clearing the transcript.
 */
describe("MYourWidget", () => {
  it("hides the chat overlay until the floating button is tapped", () => {
    render(<MYourWidget />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));

    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();
  });

  it("shows a short intro line under the header", () => {
    render(<MYourWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));

    expect(
      screen.getByText("Trợ lý đồng hành giúp bạn nắm rõ tình hình tài chính — hỏi bất kỳ điều gì bạn quan tâm."),
    ).toBeInTheDocument();
  });

  it("sends a message and shows a reply from M-Your", () => {
    render(<MYourWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), {
      target: { value: "Xin chào" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    expect(screen.getAllByText(/M-Your/).length).toBeGreaterThan(0);
  });

  it("clears the whole conversation when the delete button is tapped", () => {
    render(<MYourWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));
    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), {
      target: { value: "Xin chào" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(screen.getByText("Xin chào")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xóa hội thoại" }));

    expect(screen.queryByText("Xin chào")).not.toBeInTheDocument();
  });

  it("closes the overlay with the close button", () => {
    render(<MYourWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));
    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
