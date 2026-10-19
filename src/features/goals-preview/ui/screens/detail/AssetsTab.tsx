"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { LiquidAssetDetail } from "../assets/LiquidAssetDetail";
import { ChevronRight, Plus, Landmark, Car, Package } from "lucide-react";
import { formatVnd, formatVndCompact } from "@/lib/format";
import { assetGain, assetValue, formatISODate, goalAssets } from "../../../engine";
import { FIXED_CATEGORY_LABEL, LIQUID_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { SourceTag } from "../../shared/SourceTag";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, ring, secondaryButton, sectionTitle } from "../../shared/styles";
import { canTransact, isStaleValuation, type GoalContext } from "./common";

export function AssetsTab({ ctx, goalId }: { ctx: GoalContext; goalId: string }) {
  const { nav } = usePreview();
  const [detailId, setDetailId] = useState<string | null>(null);
  const { state, goal } = ctx;
  const assets = goalAssets(state, goalId);
  const liquid = assets.flatMap((a) => (a.type === "liquid" ? [a] : []));
  const fixed = assets.flatMap((a) => (a.type === "fixed" ? [a] : []));

  return (
    <div className="flex flex-col gap-4">
      <Sheet open={detailId !== null} title={liquid.find((asset) => asset.id === detailId)?.name ?? "Chi tiết tài sản"} onClose={() => setDetailId(null)}>
        {detailId && <LiquidAssetDetail params={{ goalId, assetId: detailId }} embedded onNavigate={() => setDetailId(null)} />}
      </Sheet>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center"><h2 className={sectionTitle}>Linh hoạt</h2><InfoTooltip label="tài sản linh hoạt" text="Sản phẩm MSB như tiền gửi, quỹ hoặc trái phiếu. Khả năng bán, rút tiền và giá trị nhận lại phụ thuộc từng sản phẩm." /></div>
          <SourceTag source="msb" />
        </div>
        {liquid.length === 0 ? (
          <div className={`${card} flex flex-col gap-2 text-center`}>
            <p className="text-sm text-muted">Chưa có tài sản linh hoạt. Đưa tiền nhàn rỗi vào tiết kiệm, quỹ hoặc trái phiếu để sinh lời.</p>
            {goal.status === "accumulating" && (
              <button type="button" className={secondaryButton} onClick={() => nav.push("InvestSuggest", { goalId })}>
                Xem gợi ý đầu tư
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {liquid.map((a) => {
              const gain = assetGain(a, state);
              return (
                <li key={a.id}>
                  <button type="button" className={`${card} flex w-full min-w-0 flex-col gap-3 text-left ${ring}`} onClick={() => setDetailId(a.id)}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong"><Landmark size={20} aria-hidden /></span>
                      <div className="min-w-0"><p className="text-[15px] font-semibold leading-5 text-text">{a.name}</p><p className="mt-1 text-[12px] text-muted">{LIQUID_CATEGORY_LABEL[a.category]}</p></div>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Đóng góp vào mục tiêu</p>
                      <p className="mt-1 text-[24px] font-bold tabular-nums text-text">{formatVndCompact(Math.round(assetValue(a, state) * a.countPercent / 100))}</p>
                      {a.countPercent < 100 && <p className="mt-1 text-[12px] text-muted">{a.countPercent}% giá trị hiện tại {formatVndCompact(assetValue(a, state))}</p>}
                      {gain !== 0 && <p className={`mt-1 text-[12px] ${gain > 0 ? "text-positive" : "text-negative"}`}>{gain > 0 ? "Lãi" : "Lỗ"} {formatVnd(Math.abs(gain))} so với vốn</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <p className="text-[12px] text-muted">{a.maturityDate ? `Đáo hạn ${formatISODate(a.maturityDate)}` : "Giá trị có thể thay đổi theo thị trường"}</p>
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-strong">Chi tiết <ChevronRight size={16} aria-hidden /></span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center"><h2 className={sectionTitle}>Cố định</h2><InfoTooltip label="tài sản cố định" text="Nhà, xe, vàng… có giá trị do bạn tự khai. Chỉ phần giá trị theo tỷ lệ bạn chọn được tính vào mục tiêu." /></div>
          <SourceTag source="self_reported" />
        </div>
        {fixed.length === 0 ? (
          <p className={`${card} text-center text-sm text-muted`}>Chưa có tài sản cố định nào được khai báo.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fixed.map((a) => {
              const stale = isStaleValuation(a.valuationDate, state.clock.today);
              return (
                <li key={a.id} className="relative">
                  <button type="button" className={`${card} flex w-full min-w-0 flex-col gap-3 text-left ${ring}`} onClick={() => nav.push("RevalueAsset", { goalId, assetId: a.id })}>
                    <div className={`flex items-start gap-3 ${stale ? "pr-9" : ""}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-source-self-soft text-source-self">{a.category === "car" ? <Car size={20} aria-hidden /> : <Package size={20} aria-hidden />}</span>
                      <div className="min-w-0"><p className="text-[15px] font-semibold leading-5 text-text">{a.name}</p><p className="mt-1 text-[12px] text-muted">{FIXED_CATEGORY_LABEL[a.category]}</p></div>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Đóng góp vào mục tiêu</p>
                      <p className="mt-1 text-[24px] font-bold tabular-nums text-text">{formatVndCompact(Math.round(a.value * a.countPercent / 100))}</p>
                      <p className="mt-1 text-[12px] text-muted">{a.countPercent}% giá trị tự khai {formatVndCompact(a.value)}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <p className="text-[12px] text-muted">Định giá {formatISODate(a.valuationDate)}</p>
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-strong">Cập nhật giá <ChevronRight size={16} aria-hidden /></span>
                    </div>
                  </button>
                  {stale && <div className="absolute right-2 top-2"><InfoTooltip warning label={`giá trị đã cũ của ${a.name}`} text={`Tài sản này được định giá ngày ${formatISODate(a.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá trị để tiến độ mục tiêu sát thực tế.`} /></div>}
                </li>
              );
            })}
          </ul>
        )}

        {canTransact(goal) && (
          <button type="button" className={secondaryButton} onClick={() => nav.push("AddFixedAsset", { goalId })}>
            <Plus size={18} aria-hidden /> Thêm tài sản cố định
          </button>
        )}
      </section>
    </div>
  );
}
