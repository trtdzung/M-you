"use client";

import { ChevronDown, ChevronRight, Home, ListChecks } from "lucide-react";
import { resolveJump } from "../../../devtools/screenParams";
import { SCENARIOS } from "../../../data/scenarios";
import type { ScreenId, ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { card, chip, divider, listRow, ring, sectionTitle, screenPadding } from "../../shared/styles";

const IDEAS: { title: string; body: string }[] = [
  {
    title: "Mỗi mục tiêu có một tài khoản riêng",
    body: "Mở tài khoản thanh toán riêng cho từng mục tiêu, tiền để dành không lẫn với tiền tiêu hằng ngày.",
  },
  {
    title: "Giá trị mục tiêu = tiền + tài sản",
    body: "Tiền trong tài khoản cộng với tài sản đã gắn vào (tiền gửi, quỹ, xe, nhà…). Tài sản tự khai luôn được ghi rõ là tự khai.",
  },
  {
    title: "Gợi ý đầu tư cho tiền nhàn rỗi",
    body: "Tiền để lâu không dùng được gợi ý gửi có kỳ hạn hoặc quỹ phù hợp thời hạn. Khách luôn là người quyết định.",
  },
  {
    title: "Vay là phương án cuối cùng",
    body: "Thiếu tiền thì thứ tự là: tiết kiệm thêm, lùi ngày, giảm số tiền, rồi mới đến vay, và chặn nếu vượt khả năng trả.",
  },
  {
    title: "Vòng đời rõ ràng",
    body: "Đang tích luỹ, rồi hoàn thành. Hoặc đạt mục tiêu bằng vay, trả nợ, hoàn thành. Hoặc chưa đạt, gia hạn hay đóng.",
  },
];

interface FlowItem {
  screen: ScreenId;
  label: string;
  hint: string;
}

const FLOW_GROUPS: { title: string; items: FlowItem[] }[] = [
  {
    title: "Tạo mục tiêu",
    items: [
      { screen: "TemplatePick", label: "Chọn loại mục tiêu", hint: "Bước 1: xe, nhà, du lịch…" },
      { screen: "GoalInfo", label: "Thông tin mục tiêu", hint: "Tên, số tiền, ngày, mức linh hoạt" },
      { screen: "OpeningFunds", label: "Tiền & tài sản ban đầu", hint: "Số tiền có sẵn và tài sản gắn vào" },
      { screen: "FeasibilityResult", label: "Kết quả khả thi", hint: "Khả thi, sát, không kịp hoặc chưa đủ dữ liệu" },
      { screen: "OptionsCompare", label: "So sánh phương án", hint: "Tiết kiệm thêm, lùi ngày, giảm, vay" },
      { screen: "OpenAccountConfirm", label: "Mở tài khoản mục tiêu", hint: "Xác nhận trước khi mở" },
      { screen: "StandingOrderSetup", label: "Trích tiền tự động", hint: "Thiết lập số tiền và ngày trích" },
      { screen: "CreateSuccess", label: "Tạo thành công", hint: "Màn kết thúc luồng tạo" },
    ],
  },
  {
    title: "Tiền",
    items: [
      { screen: "GoalList", label: "Danh sách mục tiêu", hint: "Đang chạy, lịch sử, sắp xếp ưu tiên" },
      { screen: "GoalDetail", label: "Chi tiết mục tiêu", hint: "Tiến độ, tiền & tài sản, giao dịch" },
      { screen: "DepositFlow", label: "Nạp tiền", hint: "Từ tài khoản chính vào mục tiêu" },
      { screen: "WithdrawFlow", label: "Rút tiền", hint: "Có cảnh báo; rút khẩn cấp" },
      { screen: "StandingOrderManage", label: "Quản lý trích tự động", hint: "Sửa, tạm dừng, xử lý khi thất bại" },
      { screen: "CloseGoalFlow", label: "Đóng mục tiêu", hint: "Hoàn tiền về tài khoản chính" },
    ],
  },
  {
    title: "Tài sản & đầu tư",
    items: [
      { screen: "AddFixedAsset", label: "Thêm tài sản cố định", hint: "Nhà, xe, vàng… tự khai giá trị" },
      { screen: "RevalueAsset", label: "Định giá lại tài sản", hint: "Cập nhật giá trị đã cũ" },
      { screen: "LiquidAssetDetail", label: "Chi tiết tài sản linh hoạt", hint: "Quỹ, tiền gửi, lãi lỗ" },
      { screen: "SellAsset", label: "Bán tài sản", hint: "Phí và số tiền nhận về" },
      { screen: "InvestSuggest", label: "Gợi ý đầu tư", hint: "Cho tiền nhàn rỗi trong mục tiêu" },
      { screen: "InvestConfirm", label: "Xác nhận đầu tư", hint: "Tóm tắt trước khi gửi / mua" },
      { screen: "MaturityChoice", label: "Tiền gửi đáo hạn", hint: "Tái tục hay nhận tiền về" },
    ],
  },
  {
    title: "Vay",
    items: [
      { screen: "LoanSimulator", label: "Tính khoản vay", hint: "Số tiền, kỳ hạn, trả mỗi tháng" },
      { screen: "LoanBlocked", label: "Vay bị chặn", hint: "Vượt 40% thu nhập, đề xuất thay thế" },
      { screen: "LoanApply", label: "Đăng ký vay", hint: "Xác nhận và giải ngân" },
    ],
  },
  {
    title: "Đến hạn",
    items: [
      { screen: "DueResult", label: "Kết quả đến hạn", hint: "Đủ tiền hay thiếu, chọn bước tiếp" },
      { screen: "MissedOptions", label: "Chưa đạt: lựa chọn", hint: "Lùi ngày, giảm số tiền, vay, đóng" },
      { screen: "AchievedIntro", label: "Đạt mục tiêu (bằng vay)", hint: "Giới thiệu giai đoạn 2" },
      { screen: "CompletedCelebration", label: "Hoàn thành", hint: "Chúc mừng, gợi ý mục tiêu tiếp" },
    ],
  },
  {
    title: "Giai đoạn 2: tích luỹ & trả nợ",
    items: [
      { screen: "RepayOverview", label: "Tổng quan trả nợ", hint: "Kỳ tới, quá hạn, dư nợ" },
      { screen: "RepaySchedule", label: "Lịch trả nợ", hint: "Từng kỳ gốc, lãi" },
      { screen: "Prepay", label: "Trả trước", hint: "Giảm lãi, rút ngắn kỳ hạn" },
    ],
  },
];

/** Trang bắt đầu cho team: giới thiệu, kịch bản, đường tắt tới từng màn. */
export function FlowMap({ params }: ScreenProps) {
  void params;
  const { state, dispatch, nav } = usePreview();

  return (
    <div className={screenPadding}>
      <ScreenHeader
        title="Bản đồ luồng"
        subtitle="Mục tiêu · bản mô phỏng để team xem và thử"
        hideBack
      />

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className={sectionTitle}>5 ý chính của tính năng</h2>
        <ol className="flex flex-col gap-2.5">
          {IDEAS.map((idea, i) => (
            <li key={idea.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-text">{idea.title}</p>
                <p className="text-[13px] leading-5 text-muted">{idea.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-[12px] leading-4 text-muted">
          Mọi số liệu và gợi ý ở đây là mô phỏng, không gọi AI hay hệ thống ngân hàng thật.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => nav.push("HomeMock")} className={`${card} flex items-center gap-2.5 text-left ${ring}`}>
          <Home size={20} aria-hidden className="shrink-0 text-primary-strong" />
          <span className="text-sm font-semibold text-text">Trang chủ giả lập</span>
        </button>
        <button type="button" onClick={() => nav.push("GoalList")} className={`${card} flex items-center gap-2.5 text-left ${ring}`}>
          <ListChecks size={20} aria-hidden className="shrink-0 text-primary-strong" />
          <span className="text-sm font-semibold text-text">Danh sách mục tiêu</span>
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className={sectionTitle}>Kịch bản thử ({SCENARIOS.length})</h2>
        <p className="text-[13px] leading-5 text-muted">Chọn một kịch bản để nạp dữ liệu và nhảy tới màn cần xem.</p>
        <ul className="flex flex-col gap-2.5">
          {SCENARIOS.map((sc) => {
            const current = state.scenarioId === sc.id;
            return (
              <li key={sc.id} className={`${card} flex flex-col gap-2 ${current ? "ring-2 ring-primary/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted px-1.5 text-xs font-bold text-text">
                    {sc.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-5 text-text">{sc.title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted">{sc.description}</p>
                  </div>
                </div>
                {sc.highlights.length > 0 && (
                  <ul className="ml-10 list-disc pl-4 text-[12px] leading-4 text-muted">
                    {sc.highlights.slice(0, 3).map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
                <div className="ml-10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "loadScenario", scenarioId: sc.id, jump: true })}
                    className={`inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg ${ring}`}
                  >
                    Mở
                  </button>
                  {current && <span className="text-xs font-semibold text-primary-strong">Đang dùng</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={sectionTitle}>Các luồng màn hình</h2>
        <p className="text-[13px] leading-5 text-muted">
          Bấm để vào thẳng một màn, dùng dữ liệu của kịch bản hiện tại. Một số màn cần đúng loại dữ liệu mới có nội dung.
        </p>
        {FLOW_GROUPS.map((group, index) => (
          <details key={group.title} open={index === 0} className="group overflow-hidden rounded-card bg-surface shadow-card">
            <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 ${ring}`}>
              <span className="text-sm font-semibold text-text">{group.title}</span>
              <span className="text-xs text-muted">{group.items.length} màn</span>
              <ChevronDown size={18} aria-hidden className="ml-auto text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className={`${divider} border-t border-border`}>
              {group.items.map((item) => {
                const jump = resolveJump(state, item.screen);
                return (
                  <li key={item.screen}>
                    <button type="button" onClick={() => nav.push(item.screen, jump.params)} className={listRow}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text">{item.label}</span>
                        <span className="block text-[12px] leading-4 text-muted">
                          {item.hint}
                          {jump.missing ? ` · lưu ý: ${jump.missing}` : ""}
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </section>

      <button type="button" onClick={() => dispatch({ type: "reset" })} className={`${chip} self-start`}>
        Đặt lại kịch bản hiện tại
      </button>
    </div>
  );
}
