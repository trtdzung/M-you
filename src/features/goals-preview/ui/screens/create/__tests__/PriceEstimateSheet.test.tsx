import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PriceEstimateSheet } from "../PriceEstimateSheet";

const QUESTIONS = [
  { id: "q1", title: "Khu vực", options: ["Hà Nội", "TP. Hồ Chí Minh"], multi: false },
  { id: "q2", title: "Diện tích", options: ["Dưới 50 m²", "50–70 m²"], multi: false },
];
const ESTIMATE = { amount: 2_890_000_000, low: 2_400_000_000, high: 3_330_000_000, summary: "Tham khảo 3 mức giá từ 2 nguồn trên web.", sources: [{ title: "Top căn hộ Thủ Đức", url: "https://a.vn/1" }] };

const reply = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<PriceEstimateSheet open cif="CIF_0001" template="house" description="Mua nhà" onClose={onClose} onApply={onApply} />);
  return { fetchMock, onApply, onClose };
}
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

describe("PriceEstimateSheet", () => {
  it("form để tick → agent đề xuất giá → OK điền giá và đóng", async () => {
    let n = 0;
    const { fetchMock, onApply, onClose } = setup(async () => reply(++n === 1 ? { questions: QUESTIONS } : { estimate: ESTIMATE }));

    // Dạng "hỏi lại bằng nút bấm" của chat: mỗi lần một câu, trả lời câu cuối là chạy luôn (không có nút "Ước tính giá").
    await screen.findByText("Khu vực");
    expect(screen.getByText("Câu 1/2")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Hoặc tự nhập câu trả lời khác…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ước tính giá" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TP. Hồ Chí Minh" }));
    expect(await screen.findByText("Diện tích")).toBeInTheDocument();
    expect(screen.getByText("Câu 2/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "50–70 m²" }));

    expect(await screen.findByText("M-You đề xuất")).toBeInTheDocument();
    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({ cif: "CIF_0001", template: "house", description: "Mua nhà", answers: { q1: ["TP. Hồ Chí Minh"], q2: ["50–70 m²"] }, refresh: false });
    expect(screen.getByRole("link", { name: "Top căn hộ Thủ Đức" })).toHaveAttribute("href", "https://a.vn/1");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onApply).toHaveBeenCalledWith(2_890_000_000);
    expect(onClose).toHaveBeenCalled();
  });

  it("Chạy lại gọi agent lần nữa với refresh và cùng các lựa chọn", async () => {
    let n = 0;
    const { fetchMock, onApply } = setup(async () => reply(++n === 1 ? { questions: QUESTIONS } : { estimate: ESTIMATE }));
    await screen.findByText("Khu vực");
    fireEvent.click(screen.getByRole("button", { name: "Hà Nội" }));
    await screen.findByText("Diện tích");
    fireEvent.change(screen.getByPlaceholderText("Hoặc tự nhập câu trả lời khác…"), { target: { value: "80 m²" } }); // tự nhập thay vì chọn nút
    fireEvent.click(screen.getByRole("button", { name: "Dùng câu trả lời tự nhập" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chạy lại" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({ answers: { q1: ["Hà Nội"], q2: ["80 m²"] }, refresh: false });
    expect(bodyOf(fetchMock.mock.calls[2])).toMatchObject({ answers: { q1: ["Hà Nội"], q2: ["80 m²"] }, refresh: true });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("chưa tìm đủ giá thì báo và cho chạy lại hoặc sửa lựa chọn; lỗi mạng thì báo lỗi", async () => {
    let n = 0;
    setup(async () => reply(++n === 1 ? { questions: QUESTIONS } : { reason: "not_enough_prices", degraded: true }));
    await screen.findByText("Khu vực");
    fireEvent.click(screen.getByRole("button", { name: "Hà Nội" }));
    await screen.findByText("Diện tích");
    fireEvent.click(screen.getByRole("button", { name: "Dưới 50 m²" }));
    expect(await screen.findByText(/chưa tìm đủ giá/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sửa lựa chọn" }));
    expect(screen.getByText("Khu vực")).toBeInTheDocument();
    cleanup();

    setup(async () => { throw new Error("offline"); });
    expect(await screen.findByText(/Chưa ước tính được lúc này/)).toBeInTheDocument();
  });
});
