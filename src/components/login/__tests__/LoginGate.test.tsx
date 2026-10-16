import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { LOGIN_PASSWORD } from "@/lib/auth";
import { LoginGate } from "../LoginGate";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/**
 * The login gate is the app's front door: renders `LoginScreen` until a sample
 * customer (CIF_0001..0003) logs in with the shared demo password, then reveals
 * `children` and switches the active persona to match the chosen customer — all
 * session-only (no localStorage), so a reload always starts back at login.
 */
function ActivePersonaLabel() {
  const { persona } = usePersona();
  return <p>Persona hiện tại: {persona.id}</p>;
}

function renderGate() {
  return render(
    <PersonaProvider>
      <LoginGate>
        <ActivePersonaLabel />
      </LoginGate>
    </PersonaProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

describe("LoginGate", () => {
  it("shows the login screen instead of children before logging in", () => {
    renderGate();
    expect(screen.getByRole("combobox", { name: "Khách hàng" })).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
  });

  it("lists the 3 sample customers by name, in CIF order", () => {
    renderGate();

    const combobox = screen.getByRole("combobox", { name: "Khách hàng" });
    expect(within(combobox).getByRole("option", { name: "Ly Lã · CIF_0001" })).toBeInTheDocument();
    expect(within(combobox).getByRole("option", { name: "Toàn Trần · CIF_0002" })).toBeInTheDocument();
    expect(within(combobox).getByRole("option", { name: "Đào Nguyên · CIF_0003" })).toBeInTheDocument();
  });

  it("logs in with a correct CIF + password and switches to the matching persona", () => {
    renderGate();

    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0002" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Persona hiện tại: irregular")).toBeInTheDocument();
  });

  it("sends the user to Trang chủ after logging in, regardless of which screen they started on", () => {
    renderGate();

    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0001" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(push).toHaveBeenCalledWith("/");
  });

  it("stays clickable and shows an error when the password is typed before a customer is chosen", () => {
    renderGate();

    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Vui lòng chọn khách hàng")).toBeInTheDocument();
  });

  it("shows an error and stays on the login screen for a wrong password", () => {
    renderGate();

    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0001" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Sai mật khẩu, vui lòng thử lại")).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
  });
});
