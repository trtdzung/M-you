import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { takePendingChatMessage } from "@/insights/proactive/chat-handoff";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif: "CIF_0001" } }) }));
import { ScanScreen } from "../screens/ScanScreen";

beforeEach(() => { push.mockClear(); sessionStorage.clear(); });
const type = (value: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value } });

describe("Kiểm tra tin nhắn lạ → chat", () => {
  it("shows the detected kind while typing", () => {
    render(<ScanScreen />);
    type("https://msb-hoantien.com");
    expect(screen.getByText(/Nhận diện: link/i)).toBeInTheDocument();
    type("0912345678");
    expect(screen.getByText(/Nhận diện: số điện thoại/i)).toBeInTheDocument();
  });
  it("opens the M-You chat and queues exactly the typed question, without insight params", () => {
    render(<ScanScreen />);
    type("0912345678");
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(push).toHaveBeenCalledWith("/pfm?assistant=1");
    expect(takePendingChatMessage("CIF_0001")).toBe("Kiểm tra bảo mật cho số điện thoại sau: 0912345678");
  });
  it("disables the button when empty", () => {
    render(<ScanScreen />);
    expect(screen.getByRole("button", { name: "Kiểm tra" })).toBeDisabled();
  });
});
