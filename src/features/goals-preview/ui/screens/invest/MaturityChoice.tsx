"use client";

import { useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { getInvestProduct } from "../../../data/products";
import { addMonths, depositAccrued } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectAsset } from "../../../store/selectors";
import { Amount, BottomActions, ConfirmSheet, EmptyState, ScreenHeader, SummaryRows } from "../../shared";
import { card, chip, chipSelected, hint, primaryButton, ring, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { dateVi, findGoal } from "../assets/helpers";

type Choice = "rollover" | "toCash";

/** Tiền gửi đáo hạn: tái tục hoặc chuyển về tài khoản mục tiêu. */
export function MaturityChoice({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const asset = selectAsset(state, paramString(params, "assetId"));
  const goal = findGoal(state, asset?.goalId);
  const [choice, setChoice] = useState<Choice>("toCash");
  const [term, setTerm] = useState<number | undefined>();
  const [confirm, setConfirm] = useState(false);

  if (!asset || asset.type !== "liquid" || asset.category !== "term_deposit" || asset.principal === undefined || !goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Khoản đáo hạn" />
        <EmptyState title="Không có khoản đáo hạn" description="Khoản tiền gửi này đã được xử lý hoặc không tồn tại." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const today = state.clock.today;
  const product = getInvestProduct(asset.productId);
  const maturity = asset.maturityDate ?? today;
  const interest = depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, maturity);
  const total = asset.principal + interest;
  const terms = product?.kind === "term_deposit" ? product.terms.filter((t) => addMonths(today, t.months) <= goal.targetDate) : [];
  const chosen = terms.find((t) => t.months === term) ?? terms[terms.length - 1];
  const canRoll = terms.length > 0;
  const rolling = choice === "rollover" && canRoll;
  const newMaturity = rolling && chosen ? addMonths(today, chosen.months) : undefined;
  const isMatured = asset.status === "matured" || maturity <= today;

  const options: { id: Choice; title: string; desc: string; Icon: typeof Wallet; disabled?: boolean }[] = [
    { id: "toCash", title: "Chuyển về tài khoản mục tiêu", desc: "Gốc và lãi vào tài khoản mục tiêu, dùng được ngay.", Icon: Wallet },
    {
      id: "rollover",
      title: "Tái tục",
      desc: canRoll ? "Gốc và lãi gửi tiếp kỳ hạn mới, đáo hạn trước ngày mục tiêu." : "Không còn kỳ hạn nào đáo hạn trước ngày mục tiêu.",
      Icon: RefreshCw,
      disabled: !canRoll,
    },
  ];

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Khoản đáo hạn" subtitle={asset.name} />

      <section className={cn(card, "flex flex-col gap-2")}>
        <p className="text-[13px] text-muted">{isMatured ? `Đã đáo hạn ngày ${dateVi(maturity)}` : `Đáo hạn ngày ${dateVi(maturity)}`}</p>
        <Amount amount={total} source="msb" className="text-3xl font-bold" />
        <SummaryRows
          rows={[
            { label: "Tiền gốc", value: asset.principal, source: "msb" },
            { label: `Tiền lãi (${String(asset.ratePa ?? 0).replace(".", ",")}%/năm)`, value: interest, source: "msb" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2" aria-label="Chọn cách xử lý">
        <h2 className={sectionTitle}>Bạn muốn làm gì?</h2>
        {options.map(({ id, title, desc, Icon, disabled }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={choice === id}
            disabled={disabled}
            onClick={() => setChoice(id)}
            className={cn("flex min-h-14 w-full items-start gap-3 rounded-card border-2 bg-surface p-4 text-left shadow-card disabled:opacity-50", ring, choice === id ? "border-primary" : "border-transparent")}
          >
            <Icon size={22} className="mt-0.5 shrink-0 text-primary-strong" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-text">{title}</span>
              <span className="text-[13px] leading-5 text-muted">{desc}</span>
            </span>
          </button>
        ))}
        {choice === "rollover" && canRoll && (
          <div className="flex flex-col gap-2 pt-1">
            <h3 className="text-sm font-medium text-text">Kỳ hạn mới</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kỳ hạn mới">
              {terms.map((t) => (
                <button key={t.months} type="button" role="radio" aria-checked={chosen?.months === t.months} className={chosen?.months === t.months ? chipSelected : chip} onClick={() => setTerm(t.months)}>
                  {t.months} tháng · {String(t.ratePa).replace(".", ",")}%
                </button>
              ))}
            </div>
            {newMaturity && <p className={hint}>Đáo hạn mới {dateVi(newMaturity)}, trước ngày mục tiêu {dateVi(goal.targetDate)}.</p>}
          </div>
        )}
      </section>

      {!canRoll && <p className={warningBox}>Ngày mục tiêu đã gần ({dateVi(goal.targetDate)}). Nên chuyển tiền về tài khoản mục tiêu.</p>}

      <BottomActions>
        <button type="button" className={primaryButton} onClick={() => setConfirm(true)}>
          {rolling ? "Tái tục" : "Chuyển về tài khoản mục tiêu"}
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title={rolling ? "Xác nhận tái tục" : "Xác nhận chuyển tiền"}
        rows={[
          { label: "Khoản tiền gửi", value: asset.name },
          { label: rolling ? "Gốc mới (gốc + lãi)" : "Tiền về tài khoản mục tiêu", value: total, source: "msb", emphasis: true },
          ...(rolling && chosen ? [{ label: "Kỳ hạn mới", value: `${chosen.months} tháng · ${String(chosen.ratePa).replace(".", ",")}%/năm` }, { label: "Đáo hạn mới", value: dateVi(newMaturity) }] : []),
        ]}
        confirmLabel={rolling ? "Tái tục" : "Chuyển tiền"}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "handleMaturity", assetId: asset.id, choice: rolling ? "rollover" : "toCash", termMonths: rolling ? chosen?.months : undefined });
          const prev = nav.stack[nav.stack.length - 2];
          nav.pop(!rolling && prev?.screen === "LiquidAssetDetail" ? 2 : 1);
        }}
      />
    </div>
  );
}
