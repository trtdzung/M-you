import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LookupScreen } from "../screens/LookupScreen";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("lookup result context", () => {
  it("hides an old result on account or bank edits, including a late response", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(r => { resolve = r; })));
    render(<LookupScreen />);
    const account = screen.getByLabelText("Số tài khoản");
    fireEvent.change(account, { target: { value: "9704000000000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    fireEvent.change(account, { target: { value: "1234567890" } });
    resolve({ ok: true, json: async () => ({ level: "danger", label: "Nguy hiểm", note: "Dữ liệu mẫu", disclaimer: "Mô phỏng" }) });
    await vi.waitFor(() => expect(screen.queryByTestId("lookup-result")).not.toBeInTheDocument());
    fireEvent.change(account, { target: { value: "9704000000000001" } });
    expect(await screen.findByTestId("lookup-result")).toHaveTextContent("9704000000000001");
    fireEvent.change(screen.getByLabelText("Ngân hàng (không bắt buộc)"), { target: { value: "MSB" } });
    expect(screen.queryByTestId("lookup-result")).not.toBeInTheDocument();
  });
});
