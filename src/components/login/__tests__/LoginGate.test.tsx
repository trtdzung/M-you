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
 * `children` and switches the active persona to match the chosen customer — the
 * login is remembered in localStorage, so a reload stays signed in.
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

  it("lists the sample customers by name, in CIF order", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Persona hiện tại: irregular")).toBeInTheDocument();
  });

  it("sends the user to Trang chủ after logging in, regardless of which screen they started on", () => {
    renderGate();

    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(push).toHaveBeenCalledWith("/");
  });

  it("stays signed in after a reload", () => {
    const first = renderGate();
    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));
    first.unmount();

    renderGate();

    expect(screen.getByText("Persona hiện tại: irregular")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Khách hàng" })).not.toBeInTheDocument();
  });

  it("shows an error when no customer is chosen", () => {
    renderGate();
    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: LOGIN_PASSWORD },
    });
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" })).toBeEnabled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Vui lòng chọn khách hàng")).toBeInTheDocument();
  });

  it("shows an error and stays on the login screen for a wrong password", () => {
    renderGate();

    fireEvent.change(screen.getByRole("combobox", { name: "Khách hàng" }), {
      target: { value: "CIF_0001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "wrong" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Sai mật khẩu, vui lòng thử lại")).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
  });
});
