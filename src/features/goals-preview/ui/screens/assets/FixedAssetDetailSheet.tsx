"use client";

import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/features/goals-preview/format-money";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SourceTag } from "../../shared/SourceTag";
import { primaryButton } from "../../shared/styles";
import { isStaleValuation } from "../detail/common";
import { dateVi } from "./helpers";

export function FixedAssetDetailSheet({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { state, nav } = usePreview();
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "fixed") return null;
  const counted = Math.round(asset.value * asset.countPercent / 100);
  const stale = isStaleValuation(asset.valuationDate, state.clock.today);
  const title = asset.name;

  return (
    <Sheet open title={title} onClose={onClose} bodyClassName="flex flex-col !overflow-hidden !pb-0">
      <div className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-4">

          <div className="flex items-center gap-2"><span className="text-sm text-muted">{FIXED_CATEGORY_LABEL[asset.category]}</span><SourceTag source="self_reported" /></div>
          <section className="rounded-2xl bg-source-self-soft p-4">
            <p className="text-[13px] text-muted">Giá trị tính vào mục tiêu</p>
            <p className="mt-1 text-[26px] font-bold tabular-nums text-text">{formatVnd(counted)}</p>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="text-sm text-muted">{asset.countPercent}% giá trị tự khai {formatVnd(asset.value)}</p><InfoTooltip label="tỷ lệ tính vào mục tiêu" text="Chỉ phần giá trị theo tỷ lệ bạn chọn được tính vào tiến độ. Đây là tài sản tự khai, không phải tiền sẵn có trong tài khoản." /></div>
          </section>
          <p className="text-[13px] leading-5 text-muted">Đây là giá trị tài sản ước tính. Bạn cần bán tài sản để có tiền sử dụng cho mục tiêu.</p>
          <section><h3 className="mb-3 text-sm font-semibold text-text">Lịch sử định giá</h3><ol>{[{ date: asset.valuationDate, value: asset.value, label: "Gần nhất" }, ...(asset.costBasis !== asset.value ? [{ date: asset.createdAt, value: asset.costBasis, label: "Khai báo ban đầu" }] : [])].map((item, i, items) => <li key={`${item.date}-${i}`} className="flex gap-3"><div className="flex w-3 shrink-0 flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-source-self" : "bg-border"}`} />{i < items.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}</div><div className={`min-w-0 flex-1 ${i < items.length - 1 ? "pb-5" : ""}`}><div className="flex items-center justify-between gap-2"><p className="text-[12px] text-muted">{dateVi(item.date)} · {item.label}</p>{i === 0 && stale && <InfoTooltip warning label="giá trị đã cũ" text={`Giá trị được khai báo ngày ${dateVi(asset.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá để tiến độ mục tiêu sát thực tế.`} />}</div><p className="mt-1 text-sm font-semibold text-text">{formatVnd(item.value)}</p></div></li>)}</ol></section>

      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface pb-[calc(16px+var(--safe-area-bottom,0px))] pt-3">
        <button type="button" className={primaryButton} onClick={() => nav.push("RevalueAsset", { goalId: asset.goalId, assetId })}>Cập nhật giá</button>
      </div>
    </Sheet>
  );
}
