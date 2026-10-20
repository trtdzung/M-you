"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { goalValue } from "../../../engine";
import type { ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions, MoneyInput, ScreenHeader } from "../../shared";
import { card, ghostButton, input, label, ring, screenPadding } from "../../shared/styles";
import { NotFoundScreen, resolveProduct, useLoanScreen } from "../loan/shared";

export function LoanAppSurvey({ params }: ScreenProps) {
  const { goal, state, nav, toast } = useLoanScreen(params);
  const { submitLoanApplication } = usePreview();
  const product = goal ? resolveProduct(goal, undefined) : undefined;
  const [answers, setAnswers] = useState<Record<string, string>>((): Record<string, string> => product ? {
    term: `${Math.min(product.maxTermMonths, product.purpose === "house" ? 240 : product.purpose === "car" ? 60 : 36)} tháng`,
  } : {});
  const [income, setIncome] = useState<number | null>(null);
  const [principal, setPrincipal] = useState<number | null>(() => goal ? Math.max(0, goal.targetAmount - goalValue(state, goal).total) : null);
  const [picker, setPicker] = useState<{ key: string; title: string; options: string[] } | null>(null);
  const set = (key: string, value: string) => setAnswers((old) => ({ ...old, [key]: value }));
  if (!goal) return <NotFoundScreen title="Khảo sát thông tin" onCta={() => nav.push("GoalList")} />;
  const maxTerm = resolveProduct(goal, undefined).maxTermMonths;
  const terms = [...new Set([6, 12, 24, 36, 60, 120, 180, 240, 300, 360, maxTerm])].filter((m) => m <= maxTerm).sort((a, b) => a - b);
  const select = (key: string, title: string, options: string[], optional = false) => (
    <div className="flex flex-col gap-1.5">
      <span className={label}>{title}{optional && <span className="text-muted"> (Không bắt buộc)</span>}</span>
      <button type="button" aria-label={title} aria-haspopup="dialog" aria-expanded={picker?.key === key}
        className={`${input} flex items-center justify-between gap-3 text-left font-normal`}
        onClick={() => setPicker({ key, title, options })}>
        <span className={answers[key] ? "" : "text-muted"}>{answers[key] || "Chọn"}</span>
        <ChevronDown size={18} className="shrink-0 text-muted" aria-hidden />
      </button>
    </div>
  );
  const complete = Boolean(answers.age && answers.gender && answers.source && income !== null && answers.debt && principal !== null && principal > 0 && answers.term && answers.collateral);
  const submit = () => {
    submitLoanApplication({ goalId: goal.id, principal: principal!, termMonths: Number(answers.term.split(" ")[0]), submittedAt: Date.now() });
    toast("Hồ sơ đăng ký thành công", "success");
    if (nav.stack.some((entry) => entry.screen === "GoalDetail")) nav.popTo("GoalDetail");
    else nav.replace("GoalDetail", { goalId: goal.id });
  };
  return (
    <div className={screenPadding}>
      <ScreenHeader compact title="Khảo sát thông tin" right={<button type="button" className={ghostButton} onClick={() => nav.pop()}>Bỏ qua</button>} />
      <p className="text-[16px] leading-6 text-text">Vui lòng điền một số thông tin để hệ thống tính toán hạn mức dự kiến cho quý khách</p>
      <div className={`${card} flex flex-col gap-6`}>
        <label className="flex flex-col gap-1.5"><span className={label}>Độ tuổi của bạn</span><input className={input} inputMode="numeric" placeholder="Nhập" value={answers.age ?? ""} onChange={(e) => set("age", e.target.value)} /></label>
        {select("gender", "Giới tính của bạn", ["Nam", "Nữ", "Khác"])}
        {select("marital", "Tình trạng hôn nhân của bạn là gì?", ["Độc thân", "Đã kết hôn"], true)}
        {select("source", "Nguồn thu nhập chính của bạn là gì?", ["Lương", "Kinh doanh", "Khác"])}
        <MoneyInput emphasis={false} label="Tổng thu nhập hàng tháng của bạn là bao nhiêu?" placeholder="Nhập" value={income} onChange={setIncome} />
        {select("debt", "Bạn có đang vay ở tổ chức tài chính nào khác không?", ["Có", "Không"])}
        {select("spending", "Bạn có thói quen chi tiêu như thế nào mỗi tháng?", ["Tiết kiệm", "Cân đối", "Chi tiêu phần lớn thu nhập"], true)}
        <MoneyInput emphasis={false} label="Bạn cần vay bao nhiêu tiền?" placeholder="Nhập" value={principal} onChange={setPrincipal} />
        {select("term", "Bạn muốn trả trong bao lâu?", terms.map((m) => `${m} tháng`))}
        {select("collateral", "Bạn có tài sản nào có thể dùng để đảm bảo cho khoản vay không?", ["Bất động sản", "Ô tô", "Tiền gửi", "Không có"])}
        {select("contact", "Bạn muốn được tư vấn qua hình thức nào?", ["Điện thoại", "Tại chi nhánh", "Email"], true)}
      </div>
      <Sheet open={picker !== null} title={picker?.title ?? "Chọn thông tin"} onClose={() => setPicker(null)}>
        <div className="flex flex-col gap-2">
          {picker?.options.map((option) => (
            <button key={option} type="button" aria-pressed={answers[picker.key] === option}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[16px] ${answers[picker.key] === option ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-text"}`}
              onClick={() => { set(picker.key, option); setPicker(null); }}>
              <span>{option}</span>
              {answers[picker.key] === option && <Check size={18} aria-hidden />}
            </button>
          ))}
        </div>
      </Sheet>
      <BottomActions><button type="button" className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-transparent bg-primary px-4 text-[16px] font-semibold text-primary-fg transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted ${ring}`} disabled={!complete} onClick={submit}>Tiếp tục</button></BottomActions>
    </div>
  );
}
