"use client";

import { useState } from "react";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/features/goals-preview/format-money";
import { assetValue } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectAsset } from "../../../store/selectors";
import { Amount, BottomActions, ConfirmSheet, EmptyState, MoneyInput, ScreenHeader, SliderRow, SummaryRows } from "../../shared";
import { card, hint, primaryButton, screenPadding, sectionTitle } from "../../shared/styles";
import { findGoal, pct, progressAfter, quoteSale } from "./helpers";

/** Bán / tất toán tài sản. Linh hoạt: tiền về tài khoản mục tiêu. Cố định: ghi nhận đã bán. */
export function SellAsset({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const asset = selectAsset(state, paramString(params, "assetId"));
  const goal = findGoal(state, asset?.goalId);
  const [percent, setPercent] = useState(100);
  const [proceedsInput, setProceedsInput] = useState<number | null>(asset?.type === "fixed" ? asset.value : null);
  const [confirm, setConfirm] = useState(false);

  if (!asset || !goal || asset.status === "sold") {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Bán tài sản" />
        <EmptyState title="Không tìm thấy tài sản" description="Tài sản có thể đã được bán." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const isLiquid = asset.type === "liquid";
  const quote = isLiquid ? quoteSale(state, asset) : undefined;
  // Only funds can be sold in part; deposits and bonds are settled in full.
  const partial = isLiquid && asset.category === "fund";
  const fraction = partial ? percent / 100 : 1;

  const proceeds = isLiquid ? Math.round((quote?.net ?? 0) * fraction) : proceedsInput ?? 0;
  const fee = isLiquid ? Math.round((quote?.fee ?? 0) * fraction) : 0;
  // Cash in goal account goes up by proceeds; the asset's counted value goes away.
  const removedCounted = Math.round(((isLiquid ? assetValue(asset, state) * fraction : asset.value) * asset.countPercent) / 100);
  const delta = proceeds - removedCounted;
  const progress = progressAfter(state, goal, delta);
  const valid = proceeds > 0;
  const verb = isLiquid && asset.category === "term_deposit" ? "Tất toán" : "Bán";

  return (
    <div className={screenPadding}>
      <ScreenHeader title={`${verb} tài sản`} subtitle={asset.name} />

      <section className={cn(card, "flex flex-col gap-1")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-muted">Giá trị hiện tại</p>
          {quote?.early && <InfoTooltip warning label="tất toán trước hạn" text={`${quote.note}. ${quote.lostInterest > 0 ? `Phần lãi bị giảm theo báo giá hiện tại: ${formatVnd(quote.lostInterest)}.` : "Kiểm tra mức lãi áp dụng khi tất toán trước hạn trước khi xác nhận."}`} />}
        </div>
        <Amount amount={isLiquid ? quote?.gross : asset.value} source={asset.source} className="text-2xl font-bold" />
      </section>

      {partial && (
        <section className={cn(card, "flex flex-col gap-2")}>
          <SliderRow label="Phần muốn bán" value={percent} min={10} max={100} step={10} onChange={setPercent} format={(v) => `${v}%`} />
          <div className="flex gap-2">
            {[25, 50, 100].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPercent(p)}
                className={cn(
                  "min-h-11 flex-1 rounded-full border text-sm font-semibold",
                  percent === p ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-text",
                )}
              >
                {p === 100 ? "Tất cả" : `${p}%`}
              </button>
            ))}
          </div>
        </section>
      )}

      {!isLiquid && (
        <section className={cn(card, "flex flex-col gap-2")}>
          <MoneyInput label="Số tiền bán được" value={proceedsInput} onChange={setProceedsInput} hint="Tiền bán sẽ ghi vào tài khoản mục tiêu. Bạn tự khai số tiền." />
        </section>
      )}

      {!isLiquid && asset.countPercent > 0 && <p className={hint}>Khi bán, phần tài sản đang tính vào mục tiêu sẽ được thay bằng tiền mặt.</p>}

      <section className={cn(card, "flex flex-col gap-2")}>
        <div className="flex items-center justify-between gap-2"><h2 className={sectionTitle}>Bạn nhận được</h2>{quote && !quote.early && quote.fee > 0 && <InfoTooltip warning label="phí bán tài sản" text={`${quote.note}.`} />}</div>
        <SummaryRows
          rows={[
            ...(fee > 0 ? [{ label: "Phí bán", value: fee, source: "msb" as const }] : []),
            { label: "Tiền về tài khoản mục tiêu", value: proceeds, source: isLiquid ? ("msb" as const) : ("self_reported" as const), emphasis: true },
            { label: "Tiến độ mục tiêu", value: `${pct(progress.before)} → ${pct(progress.after)}` },
          ]}
        />
      </section>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          {verb} {partial && percent < 100 ? `${percent}%` : ""}
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        danger={!!quote?.early}
        title={`Xác nhận ${verb.toLowerCase()}`}
        rows={[
          { label: "Tài sản", value: asset.name },
          ...(partial ? [{ label: "Phần bán", value: `${percent}%` }] : []),
          ...(fee > 0 ? [{ label: "Phí bán", value: fee, source: "msb" as const }] : []),
          { label: "Tiền về tài khoản mục tiêu", value: proceeds, source: isLiquid ? ("msb" as const) : ("self_reported" as const), emphasis: true },
        ]}
        note={quote?.early ? `Tất toán trước hạn, mất khoảng ${formatVnd(quote.lostInterest)} tiền lãi.` : undefined}
        confirmLabel={verb}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch(isLiquid ? { type: "sellAsset", assetId: asset.id, fraction } : { type: "sellAsset", assetId: asset.id, proceeds });
          const prev = nav.stack[nav.stack.length - 2];
          nav.pop(fraction >= 1 && prev?.screen === "LiquidAssetDetail" ? 2 : 1);
        }}
      />
    </div>
  );
}
