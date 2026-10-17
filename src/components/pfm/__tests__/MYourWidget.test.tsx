import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { type RenderOptions, act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import { PersonaProvider } from "@/providers/context";
import { MYourWidget } from "../MYourWidget";
import * as agentApi from "@/lib/agent-api";


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

// The overlay opens only via `?assistant=1` (VoiceFab's "Chuyển qua Chat"
// hand-off), so the mocked search params decide whether it is open.
const nav = vi.hoisted(() => ({ search: "assistant=1", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/**
 * The M-Your chat overlay lives on every /pfm screen (mounted via the
 * PhoneShell `fab` slot). It is wired to the real agent (`src/lib/agent-api.ts`)
 * — opening the overlay loads real history and gates the composer until that
 * finishes; sending/deleting call the real endpoints. `cif` comes from the
 * default persona (`stable` → `CIF_0001`) via a real `PersonaProvider`.
 */
function renderWidget() {
  return render(
    <PersonaProvider>
      <MYourWidget />
    </PersonaProvider>,
  );
}

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver (absent in jsdom).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  nav.search = "assistant=1";
  nav.replace.mockClear();
  vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
  vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({ answer: "Trả lời từ M-Your", thread_id: "CIF_0001" });
  vi.spyOn(agentApi, "deleteChatHistory").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("MYourWidget", () => {
  it("hides the chat overlay until ?assistant=1 is set", async () => {
    nav.search = "";
    const view = renderWidget();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    nav.search = "assistant=1";
    view.rerender(
      <PersonaProvider>
        <MYourWidget />
      </PersonaProvider>,
    );

    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("shows a short intro line above the M-Your title", async () => {
    renderWidget();

    expect(screen.getByText("Trợ lý Tài chính của bạn")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("loads real history for the active persona's CIF on open and gates the composer until it's ready", async () => {
    renderWidget();

    expect(agentApi.getChatHistory).toHaveBeenCalledWith("CIF_0001");
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("renders prior messages loaded from history", async () => {
    vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({
      thread_id: "CIF_0001",
      messages: [
        { role: "user", content: "Tháng này tôi chi bao nhiêu?", ui: null },
        { role: "assistant", content: "Bạn đã chi 4.000.000đ.", ui: null },
      ],
    });
    renderWidget();

    expect(await screen.findByText("Tháng này tôi chi bao nhiêu?")).toBeInTheDocument();
    expect(screen.getByText("Bạn đã chi 4.000.000đ.")).toBeInTheDocument();
  });

  it("keeps the composer and voice input available when history fails to load", async () => {
    vi.spyOn(agentApi, "getChatHistory").mockRejectedValueOnce(new Error("boom"));
    renderWidget();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Không tải được lịch sử M-Your. Bạn vẫn có thể thử nhập bằng giọng nói.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nhập bằng giọng nói" })).toBeEnabled();

    vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
    fireEvent.click(screen.getByRole("button", { name: "Thử tải lại lịch sử" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("sends a message via the real agent and shows the real reply", async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(agentApi.sendChatMessage).toHaveBeenCalledWith("Xin chào", "CIF_0001");
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    expect(await screen.findByText("Trả lời từ M-Your")).toBeInTheDocument();
  });

  it("renders markdown in agent replies (bold text and a GFM table) as real elements", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({
      answer:
        "Bạn đang có **2 hũ**:\n\n| Hũ | Số tiền |\n|----|---------|\n| Giải trí | 600.000đ |\n| Tiết kiệm khẩn cấp | 5.000.000đ |",
      thread_id: "CIF_0001",
    });
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Tôi có bao nhiêu hũ" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await screen.findByRole("table");
    expect(screen.getByRole("cell", { name: "Giải trí" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "5.000.000đ" })).toBeInTheDocument();
    expect(screen.getByText("2 hũ").tagName).toBe("STRONG");
  });

  it("renders a chart card below the reply when the agent returns a well-formed chart ui", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({
      answer: "Tháng này bạn chi nhiều nhất cho Mua sắm.",
      thread_id: "CIF_0001",
      ui: {
        type: "chart",
        chart_type: "pie",
        title: "Chi tiêu theo danh mục - Tháng 8/2026",
        labels: ["Mua sắm", "Ăn uống"],
        series: [{ name: "VND", data: [16280000, 10500000] }],
      },
    });
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "So sánh chi tiêu" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText("Tháng này bạn chi nhiều nhất cho Mua sắm.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Chi tiêu theo danh mục - Tháng 8/2026" })).toBeInTheDocument();
    // Pie slice labels must be visible without hovering — only the amount is hover-only (tooltip).
    expect(screen.getByText("Mua sắm")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    // Distinct hues, not the app's brand-harmonious (mostly warm/orange) jar palette —
    // 6+ categories need to be tellable apart at a glance.
    const legend = screen.getByRole("list", { name: "Chú giải Chi tiêu theo danh mục - Tháng 8/2026" });
    const dots = within(legend)
      .getAllByText(/Mua sắm|Ăn uống/)
      .map((el) => el.previousElementSibling as HTMLElement);
    expect(dots[0].style.background).not.toBe(dots[1].style.background);
    expect(dots[1].style.background).toMatch(/rgb\(14, 116, 144\)|#0e7490/i);
  });

  it("renders a bar chart card without crashing for a 6-category series (Recharts' own axis, not a plain list)", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({
      answer: "Chi tiêu theo danh mục tháng này.",
      thread_id: "CIF_0001",
      ui: {
        type: "chart",
        chart_type: "bar",
        title: "Chi tiêu theo danh mục - Tháng 8/2026",
        labels: ["Siêu thị", "Di chuyển", "Giải trí", "Ăn uống", "Mua sắm", "Hoá đơn"],
        series: [{ name: "VND", data: [6990000, 650000, 320000, 990000, 590000, 6130000] }],
      },
    });
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Chi tiêu theo danh mục" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    // jsdom can't faithfully reproduce Recharts' real getBBox-based tick-skip
    // layout (ResponsiveContainer measures 0×0 there regardless), so this only
    // asserts the card renders without throwing for a 6-category series — the
    // actual "every label visible, none dropped" fix (`interval={0}` + angled
    // labels on the bar chart's XAxis, see `AgentChartCard.tsx`) is verified
    // against the real agent in a real browser, see `todo.md`.
    expect(await screen.findByRole("img", { name: "Chi tiêu theo danh mục - Tháng 8/2026" })).toBeInTheDocument();
  });

  it("ignores an unsupported or malformed ui payload and shows only the text answer", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({
      answer: "Đây là đề xuất tạo hũ mới.",
      thread_id: "CIF_0001",
      // create_jar (Feature 4) isn't implemented yet — still an "unsupported type" today.
      ui: { type: "create_jar", jar_name: "Du lịch", allocation_amount: 1000000, reason: "reason" } as agentApi.UiPayload,
    });
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Tạo hũ mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText("Đây là đề xuất tạo hũ mới.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thanh toán ngay" })).not.toBeInTheDocument();
  });

  it("shows an inline error on the reply bubble when sending fails", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockRejectedValueOnce(new Error("network down"));
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText(/Không gửi được tin nhắn/)).toBeInTheDocument();
  });

  it("deletes history via the real agent, clears the transcript, and locks the composer for 30s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText("Xin chào")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Xóa hội thoại" }));
    await waitFor(() => expect(agentApi.deleteChatHistory).toHaveBeenCalledWith("CIF_0001"));

    expect(screen.queryByText("Xin chào")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1_001);
    });
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("closes the overlay with the close button by clearing ?assistant", async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    expect(nav.replace).toHaveBeenCalledWith("/pfm?", { scroll: false });
  });
});
