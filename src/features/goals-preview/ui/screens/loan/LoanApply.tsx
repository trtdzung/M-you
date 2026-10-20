"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { maskAccountNumber } from "@/lib/format";
import { DECLARED_CATEGORY_LABEL, TEMPLATE_LABEL } from "../../../model/labels";
import type { DeclaredAssetCategory } from "../../../model/types";
import { addMonths, assetValue, buildSchedule, formatISODate, formatMonths, goalValue, quoteLoan, totalInterest } from "../../../engine";
import { nextSettleDate } from "../../../engine/settle";
import { Sheet } from "@/components/primitives";
import { paramNumber, type ScreenProps } from "../../../model/screens";
import { BottomActions, ConfirmSheet, ScreenHeader, SummaryRows } from "../../shared";
import { MoneyInput } from "../../shared/MoneyInput";
import { errorBox, infoBox, input, label, primaryButton, ring, screenPadding, secondaryButton, warningBox } from "../../shared/styles";
import { INDICATIVE_NOTE, NotFoundScreen, Section, loanParamsFrom, useLoanScreen } from "./shared";

/** Đăng ký vay (mô phỏng): hồ sơ điền sẵn, đồng ý điều khoản, xác nhận → giải ngân. */
export function LoanApply({ params }: ScreenProps) {
  const { state, dispatch, goal, account, nav, today } = useLoanScreen(params);
  const [agreed, setAgreed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Tiền mặt của mục tiêu dùng để mua tài sản nào: tài sản cố định đang có, hoặc tài sản mới (mặc định là chính tài sản mục tiêu).
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlement, setSettlement] = useState<"now" | "next">("now");
  const [buyWith, setBuyWith] = useState<string>("new");
  const [newName, setNewName] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<number | null | undefined>(undefined);
  if (!goal) return <NotFoundScreen title="Đăng ký vay" onCta={() => nav.push("GoalList")} />;

  const { product, principal, termMonths } = loanParamsFrom(params, goal, state);
  const quote = quoteLoan(state, { productId: product.id, principal, ratePa: product.ratePa, termMonths, startDate: today });
  const totalInt = totalInterest(buildSchedule(principal, product.ratePa, termMonths, today));
  const allowed = quote.affordability.allowed;
  const accountText = account ? `${account.name} · ${maskAccountNumber(account.number)}` : "Tài khoản mục tiêu";

  // Chỉ cảnh báo, không chặn: khách vẫn gửi đăng ký được.
  const lowSaved = goalValue(state, goal).total < goal.targetAmount * 0.3;
  const investments = state.assets.filter((a) => a.goalId === goal.id && a.type === "msb" && a.status !== "sold");
  const ownedDeclared = state.assets.filter((a) => a.goalId === goal.id && a.type === "declared");
  const purchaseName = (newName ?? goal.name).trim();
  const purchaseValue = newValue === undefined ? goal.targetAmount : newValue;
  const newCategory: DeclaredAssetCategory = goal.template === "house" ? "house" : goal.template === "car" ? "car" : "other";
  const purchaseValid = buyWith !== "new" || (purchaseName !== "" && purchaseValue !== null && purchaseValue > 0);
  const confirm = () => {
    const purchase =
      buyWith === "new"
        ? { name: purchaseName, category: newCategory, value: purchaseValue ?? goal.targetAmount }
        : { assetId: buyWith };
    dispatch({ type: "takeLoan", goalId: goal.id, productId: product.id, principal, termMonths, purchase, settlement });
    // Xong khoản vay: về màn mục tiêu, mọi thao tác tiếp theo làm ở đó.
    if (nav.stack.some((e) => e.screen === "GoalDetail")) nav.popTo("GoalDetail");
    else nav.replace("GoalDetail", { goalId: goal.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Đăng ký vay" subtitle="Hồ sơ đã được điền sẵn từ dữ liệu của bạn" />

      {lowSaved && (
        <div className={warningBox}>
          Để hồ sơ vay được phê duyệt, bạn nên có khoản tích luỹ từ 30% giá trị mục tiêu ({formatVnd(Math.round(goal.targetAmount * 0.3))}) trở lên. Bạn vẫn có thể gửi đăng ký.
        </div>
      )}

      {!allowed && (
        <div className={errorBox}>
          Khoản trả hằng tháng vượt 40% thu nhập nên chưa thể đăng ký. Hãy điều chỉnh khoản vay.
        </div>
      )}

      <Section title="Thông tin khoản vay">
        <SummaryRows
          rows={[
            { label: "Sản phẩm", value: product.name },
            { label: "Số tiền vay", value: principal, source: "msb", emphasis: true },
            { label: "Kỳ hạn", value: formatMonths(termMonths) },
            { label: "Lãi suất tham khảo", value: `${product.ratePa}%/năm` },
            { label: "Trả mỗi tháng", value: quote.monthlyPayment, source: "estimated" },
            { label: "Tổng lãi", value: totalInt, source: "estimated" },
            { label: "Kỳ trả đầu tiên", value: formatISODate(addMonths(today, 1)) },
          ]}
        />
      </Section>

      <Section title="Giải ngân và mục đích">
        <SummaryRows
          rows={[
            { label: "Tiền giải ngân vào", value: accountText },
            { label: "Mục đích", value: `${TEMPLATE_LABEL[goal.template]}: ${goal.name}` },
            { label: "Người vay", value: `${state.customer.name} · CIF ${state.customer.cif}` },
            { label: "Thu nhập tháng", value: state.customer.monthlyIncome, source: "msb" },
          ]}
        />
        <div className={infoBox}>
          Tiền vay dùng để thanh toán “{goal.name}”. Tiền mặt đang có trong tài khoản mục tiêu được rút để mua tài sản bạn chọn bên dưới. Sau đó tài khoản mục tiêu dùng để trả nợ hằng tháng (gốc và lãi).
        </div>
      </Section>

      {(
        <Section title="Tiền trong tài khoản mục tiêu dùng để mua tài sản">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="buy-with" className={label}>Tài sản mua</label>
              <select id="buy-with" className={input} value={buyWith} onChange={(e) => setBuyWith(e.target.value)}>
                <option value="new">Thêm tài sản mới ({DECLARED_CATEGORY_LABEL[newCategory]})</option>
                {ownedDeclared.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {buyWith === "new" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="buy-name" className={label}>Tên tài sản</label>
                  <input id="buy-name" className={input} value={newName ?? goal.name} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <MoneyInput label="Giá trị tài sản" value={purchaseValue} onChange={setNewValue} />
              </>
            )}
            <p className="text-xs leading-4 text-muted">Các tài sản khác của mục tiêu được dùng để mua mục tiêu và sẽ không còn trong mục tiêu. Tài sản mua không tính vào tiến độ trả nợ.</p>
          </div>
        </Section>
      )}

      <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface px-3.5 py-3 ${ring}`}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="text-sm leading-5 text-text">
          Tôi đã đọc và đồng ý với điều khoản khoản vay, và cho phép MSB tự trích tài khoản mục tiêu để trả nợ mỗi kỳ.
        </span>
      </label>

      <p className="text-xs leading-4 text-muted">{INDICATIVE_NOTE}</p>

      <BottomActions>
        {allowed ? (
          <button type="button" className={primaryButton} disabled={!agreed || !purchaseValid} onClick={() => (investments.length > 0 ? setSettleOpen(true) : setConfirming(true))}>
            Gửi đăng ký vay
          </button>
        ) : (
          <button type="button" className={primaryButton} onClick={() => nav.replace("LoanBlocked", { goalId: goal.id, productId: product.id, amount: principal, termMonths })}>
            Xem vì sao chưa vay được
          </button>
        )}
      </BottomActions>

      <Sheet open={settleOpen} title="Tất toán các khoản đầu tư MSB" onClose={() => setSettleOpen(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-text">
            Khi chuyển sang giai đoạn vay, các khoản đầu tư MSB của mục tiêu sẽ được tất toán và rút toàn bộ tiền đến thời điểm tất toán về tài khoản chính. Bạn chọn tất toán ngay hoặc vào kỳ tới.
          </p>
          <SummaryRows
            rows={investments.map((a) => ({
              label: a.name,
              value: assetValue(a, state),
              hint: `Kỳ tới: ${formatISODate(a.type === "msb" ? nextSettleDate(a, today) : today)}`,
            }))}
          />
          <p className="text-xs leading-4 text-muted">
            Tất toán ngay: nhận giá trị hiện tại hôm nay. Tất toán vào kỳ tới: khoản đầu tư được giữ đến ngày hẹn rồi rút toàn bộ về tài khoản chính; tiền gửi có kỳ hạn tất toán vào ngày đáo hạn, các khoản còn lại vào ngày 1 tháng sau.
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" className={primaryButton} onClick={() => { setSettlement("now"); setSettleOpen(false); setConfirming(true); }}>
              Tất toán ngay
            </button>
            <button type="button" className={secondaryButton} onClick={() => { setSettlement("next"); setSettleOpen(false); setConfirming(true); }}>
              Tất toán vào kỳ tới
            </button>
            <button type="button" className={secondaryButton} onClick={() => setSettleOpen(false)}>
              Quay lại
            </button>
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirming}
        title="Xác nhận vay"
        description="Kiểm tra lại trước khi gửi đăng ký."
        rows={[
          { label: "Số tiền vay", value: principal, emphasis: true },
          { label: "Kỳ hạn", value: formatMonths(termMonths) },
          { label: "Trả mỗi tháng", value: quote.monthlyPayment },
          { label: "Giải ngân vào", value: accountText },
        ]}
        note={`Khoản vay ${formatVnd(principal)} được giải ngân ngay và mục tiêu chuyển sang giai đoạn trả nợ.`}
        confirmLabel="Xác nhận vay"
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </div>
  );
}
