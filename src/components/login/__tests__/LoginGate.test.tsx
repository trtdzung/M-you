import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { LoginScreen } from "../LoginScreen";
import { LoginGate } from "../LoginGate";

const push = vi.fn();
const fetchMock = vi.fn();
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
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("LoginGate", () => {
  it("keeps password focus after each keystroke", async () => {
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    const input = screen.getByPlaceholderText("Nhập mật khẩu");
    input.focus();
    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "ab" } });
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("ab");
  });

  it("shows the login screen instead of children before logging in", () => {
    renderGate();
    expect(screen.getByRole("button", { name: "Chọn khách hàng" })).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
  });

  it("lists the sample customers by name, in CIF order", () => {
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Chọn khách hàng" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Ly Lã/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /Toàn Trần/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Đào Nguyên/ })).toBeInTheDocument();
  });

  it("logs in with a correct CIF + password and switches to the matching persona", async () => {
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Chọn khách hàng" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Toàn Trần/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "test-pass" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Persona hiện tại: irregular")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-pass" }),
    });
  });

  it("sends the user to Trang chủ after logging in, regardless of which screen they started on", async () => {
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Chọn khách hàng" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Ly Lã/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "test-pass" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("stays signed in after a reload", async () => {
    const first = renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Chọn khách hàng" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Toàn Trần/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "test-pass" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));
    await screen.findByText("Persona hiện tại: irregular");
    first.unmount();

    renderGate();

    expect(await screen.findByText("Persona hiện tại: irregular")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chọn khách hàng" })).not.toBeInTheDocument();
  });

  it("shows an error when no customer is chosen", () => {
    render(<LoginScreen customers={[]} onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "test-pass" },
    });
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" })).toBeEnabled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Vui lòng chọn khách hàng")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error and stays on the login screen for a wrong password", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: false, error: "Sai mật khẩu, vui lòng thử lại" }, { status: 401 }));
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Chọn khách hàng" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Ly Lã/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "wrong" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Sai mật khẩu, vui lòng thử lại")).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic error when the login request fails", async () => {
    fetchMock.mockRejectedValue(new Error("network failure"));
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập mật khẩu"), {
      target: { value: "test-pass" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Không thể đăng nhập. Vui lòng thử lại.")).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the server configuration error without logging in", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: false, error: "Chưa cấu hình mật khẩu đăng nhập" }, { status: 500 }));
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Chưa cấu hình mật khẩu đăng nhập")).toBeInTheDocument();
    expect(screen.queryByText(/Persona hiện tại/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
