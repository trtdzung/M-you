"use client";

import { useState } from "react";
import { MoreVertical, Unlink } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SourceTag } from "../../shared/SourceTag";
import { primaryButton, secondaryButton, ring } from "../../shared/styles";
import { isStaleValuation } from "../detail/common";
import { dateVi } from "./helpers";

export function FixedAssetDetailSheet({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { state, nav, dispatch } = usePreview();
  const [view, setView] = useState<"detail" | "menu" | "remove">("detail");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "fixed") return null;
  const counted = Math.round(asset.value * asset.countPercent / 100);
  const stale = isStaleValuation(asset.valuationDate, state.clock.today);
  const title = view === "menu" ? "Tuỳ chọn tài sản" : view === "remove" ? "Bỏ tài sản khỏi mục tiêu?" : asset.name;

  return (
    <Sheet open title={title} onClose={onClose} bodyClassName="flex flex-col !overflow-hidden !pb-0">
      <div className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-4">
        {view === "detail" ? <>
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-sm text-muted">{FIXED_CATEGORY_LABEL[asset.category]}</span><SourceTag source="self_reported" /></div><button type="button" aria-label="Tuỳ chọn tài sản" onClick={() => setView("menu")} className={`flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-muted ${ring}`}><MoreVertical size={20} aria-hidden /></button></div>
          <section className="rounded-2xl bg-source-self-soft p-4">
            <p className="text-[13px] text-muted">Đóng góp vào mục tiêu</p>
            <p className="mt-1 text-[26px] font-bold tabular-nums text-text">{formatVnd(counted)}</p>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="text-sm text-muted">{asset.countPercent}% giá trị tự khai {formatVnd(asset.value)}</p><InfoTooltip label="tỷ lệ tính vào mục tiêu" text="Chỉ phần giá trị theo tỷ lệ bạn chọn được tính vào tiến độ. Đây là tài sản tự khai, không phải tiền sẵn có trong tài khoản." /></div>
          </section>
          <section><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-text">Cập nhật lần cuối</h3>{stale && <InfoTooltip warning label="giá trị đã cũ" text={`Giá trị được khai báo ngày ${dateVi(asset.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá để tiến độ mục tiêu sát thực tế.`} />}</div><p className="mt-1 text-sm text-muted">{dateVi(asset.valuationDate)}</p></section>
          <section><h3 className="mb-3 text-sm font-semibold text-text">Lịch sử định giá</h3><ol>{[{ date: asset.valuationDate, value: asset.value, label: "Gần nhất" }, ...(asset.costBasis !== asset.value ? [{ date: asset.createdAt, value: asset.costBasis, label: "Khai báo ban đầu" }] : [])].map((item, i, items) => <li key={`${item.date}-${i}`} className="flex gap-3"><div className="flex w-3 shrink-0 flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-source-self" : "bg-border"}`} />{i < items.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}</div><div className={i < items.length - 1 ? "pb-5" : ""}><p className="text-[12px] text-muted">{dateVi(item.date)} · {item.label}</p><p className="mt-1 text-sm font-semibold text-text">{formatVnd(item.value)}</p></div></li>)}</ol></section>
        </> : view === "menu" ? <><button type="button" onClick={() => setView("remove")} className={`flex min-h-12 items-center gap-2 rounded-2xl p-3 text-left text-sm font-semibold text-negative hover:bg-surface-muted ${ring}`}><Unlink size={18} aria-hidden />Bỏ tài sản khỏi mục tiêu</button><p className="text-sm leading-5 text-muted">Tài sản không bị bán. Giá trị sẽ không còn được tính vào mục tiêu này.</p></> : <><p className="text-sm text-text">{asset.name}</p><p className="text-sm leading-5 text-muted">Tiến độ mục tiêu sẽ giảm phần đóng góp {formatVnd(counted)}. Tài sản không bị bán.</p></>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface pb-[calc(16px+var(--safe-area-bottom,0px))] pt-3">
        {view === "detail" ? <button type="button" className={primaryButton} onClick={() => { onClose(); nav.push("RevalueAsset", { goalId: asset.goalId, assetId }); }}>Cập nhật giá</button> : <>
          {view === "remove" && <button type="button" className={`${primaryButton} !bg-negative`} onClick={() => { dispatch({ type: "removeAsset", assetId }); onClose(); }}>Bỏ khỏi mục tiêu</button>}
          <button type="button" className={secondaryButton} onClick={() => setView("detail")}>Quay lại chi tiết</button>
        </>}
      </div>
    </Sheet>
  );
}
