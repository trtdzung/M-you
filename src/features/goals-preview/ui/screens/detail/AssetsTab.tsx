"use client";

import { ChevronRight, Plus } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { assetGain, assetValue, formatISODate, goalAssets } from "../../../engine";
import { FIXED_CATEGORY_LABEL, LIQUID_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { SourceTag } from "../../shared/SourceTag";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, listRow, secondaryButton, sectionTitle, warningBox } from "../../shared/styles";
import { canTransact, isStaleValuation, type GoalContext } from "./common";

export function AssetsTab({ ctx, goalId }: { ctx: GoalContext; goalId: string }) {
  const { nav } = usePreview();
  const { state, goal } = ctx;
  const assets = goalAssets(state, goalId);
  const liquid = assets.flatMap((a) => (a.type === "liquid" ? [a] : []));
  const fixed = assets.flatMap((a) => (a.type === "fixed" ? [a] : []));

  return (
    <div className="flex flex-col gap-4">
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
          <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
            {liquid.map((a) => {
              const gain = assetGain(a, state);
              return (
                <li key={a.id}>
                  <button type="button" className={listRow} onClick={() => nav.push("LiquidAssetDetail", { goalId, assetId: a.id })}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{a.name}</p>
                      <p className="text-[12px] text-muted">
                        {LIQUID_CATEGORY_LABEL[a.category]}
                        {a.maturityDate ? ` · đáo hạn ${formatISODate(a.maturityDate)}` : ""}
                      </p>
                      <p className={`text-[12px] ${gain >= 0 ? "text-positive" : "text-negative"}`}>
                        {gain >= 0 ? "Lãi" : "Lỗ"} {formatVnd(Math.abs(gain))} so với vốn
                      </p>
                    </div>
                    <div className="text-right">
                      <Amount amount={assetValue(a, state)} source="msb" className="text-sm font-semibold text-text" />
                      <p className="text-[12px] text-muted">tính {a.countPercent}%</p>
                    </div>
                    <ChevronRight size={18} className="text-muted" aria-hidden />
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
          <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
            {fixed.map((a) => {
              const stale = isStaleValuation(a.valuationDate, state.clock.today);
              return (
                <li key={a.id}>
                  <button type="button" className={listRow} onClick={() => nav.push("RevalueAsset", { goalId, assetId: a.id })}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{a.name}</p>
                      <p className="text-[12px] text-muted">
                        {FIXED_CATEGORY_LABEL[a.category]} · định giá {formatISODate(a.valuationDate)}
                      </p>
                      {stale && <p className="text-[12px] font-semibold text-warning">Cần định giá lại</p>}
                    </div>
                    <div className="text-right">
                      <Amount amount={a.value} source={a.source} className="text-sm font-semibold text-text" />
                      <p className="text-[12px] text-muted">tính {a.countPercent}%</p>
                    </div>
                    <ChevronRight size={18} className="text-muted" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {fixed.some((a) => isStaleValuation(a.valuationDate, state.clock.today)) && (
          <p className={warningBox}>Có tài sản đã định giá hơn 6 tháng. Giá cũ có thể làm tiến độ lệch so với thực tế.</p>
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
