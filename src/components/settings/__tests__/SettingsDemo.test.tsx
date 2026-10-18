import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsDemo } from "../SettingsDemo";
import { SettingsDemoProvider } from "../SettingsDemoContext";

vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif: "CIF_0001", label: "Ly Lã", tier: "M-FIRST GOLD" } }) }));
vi.mock("@/components/login/LoginGate", () => ({ LOGIN_DISPLAY_NAME: { CIF_0001: "Ly Lã" } }));
afterEach(cleanup);
function mount(section?: Parameters<typeof SettingsDemo>[0]["section"]) {
  return render(<SettingsDemoProvider><SettingsDemo section={section} /></SettingsDemoProvider>);
}
describe("MSB settings simulation", () => {
  it("connects the main settings groups and preserves data permissions", () => {
    mount();
    expect(screen.getByRole("link", { name: "Bảo mật" })).toHaveAttribute("href", "/settings/security");
    expect(screen.getByRole("link", { name: "Quyền dữ liệu & trợ lý AI" })).toHaveAttribute("href", "/settings/privacy");
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });
  it("rejects weak and mismatched PINs, then clears the fields after a simulated update", async () => {
    mount("pin");
    const submit = screen.getByRole("button", { name: "Cập nhật" });
    fireEvent.change(screen.getByLabelText("Nhập mã PIN hiện tại"), { target: { value: "739251" } });
    fireEvent.change(screen.getByLabelText("Nhập mã PIN mới"), { target: { value: "111111" } });
    fireEvent.change(screen.getByLabelText("Xác nhận mã PIN mới"), { target: { value: "111111" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nhập mã PIN mới"), { target: { value: "582946" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Xác nhận mã PIN mới"), { target: { value: "582946" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(screen.getByLabelText("Nhập mã PIN hiện tại")).toHaveValue("");
    expect(await screen.findByRole("status")).toHaveTextContent("Thông tin đăng nhập demo không thay đổi");
  });
  it("requires password complexity and matching confirmation", () => {
    mount("password");
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: "sample-current" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "weak" } });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu mới"), { target: { value: "weak" } });
    expect(screen.getByRole("button", { name: "Cập nhật" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "Sample89!" } });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu mới"), { target: { value: "Sample89!" } });
    expect(screen.getByRole("button", { name: "Cập nhật" })).toBeEnabled();
  });
  it("prevents selecting duplicate security questions", async () => {
    mount("questions");
    fireEvent.click(screen.getByRole("button", { name: "Chọn câu hỏi 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Thương hiệu đồ uống mà bạn yêu thích?" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn câu hỏi 2" }));
    expect(await screen.findByRole("button", { name: "Thương hiệu đồ uống mà bạn yêu thích?" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
  });
});
