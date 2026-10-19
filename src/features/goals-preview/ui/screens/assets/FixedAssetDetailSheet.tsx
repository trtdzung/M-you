"use client";

import { useState } from "react";
import { ArrowRight, Car, ChevronRight, MoreVertical, Package, ShieldCheck, Unlink } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SourceTag } from "../../shared/SourceTag";
import { primaryButton, secondaryButton, ring } from "../../shared/styles";
import { isStaleValuation } from "../detail/common";
import { dateVi, pct, progressAfter } from "./helpers";

export function FixedAssetDetailSheet({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { state, nav, dispatch, toast } = usePreview();
  const [view, setView] = useState<"detail" | "menu" | "remove">("detail");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "fixed") return null;
  const counted = Math.round(asset.value * asset.countPercent / 100);
  const goal = state.goals.find((item) => item.id === asset.goalId);
  const impact = goal ? progressAfter(state, goal, -counted) : null;
  const stale = isStaleValuation(asset.valuationDate, state.clock.today);
  const title = view === "menu" ? "Tuỳ chọn tài sản" : view === "remove" ? "Gỡ tài sản khỏi mục tiêu?" : asset.name;

  return (
    <Sheet open title={title} onClose={onClose} headerAction={view === "detail" ? <button type="button" aria-label="Tuỳ chọn tài sản" onClick={() => setView("menu")} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted ${ring}`}><MoreVertical size={20} aria-hidden /></button> : undefined} bodyClassName="flex flex-col !overflow-hidden !pb-0">
      <div className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-4">
        {view === "detail" ? <>
          <div className="flex items-center gap-2"><span className="text-sm text-muted">{FIXED_CATEGORY_LABEL[asset.category]}</span><SourceTag source="self_reported" /></div>
          <section className="rounded-2xl bg-source-self-soft p-4">
            <p className="text-[13px] text-muted">Giá trị tính vào mục tiêu</p>
            <p className="mt-1 text-[26px] font-bold tabular-nums text-text">{formatVnd(counted)}</p>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="text-sm text-muted">{asset.countPercent}% giá trị tự khai {formatVnd(asset.value)}</p><InfoTooltip label="tỷ lệ tính vào mục tiêu" text="Chỉ phần giá trị theo tỷ lệ bạn chọn được tính vào tiến độ. Đây là tài sản tự khai, không phải tiền sẵn có trong tài khoản." /></div>
          </section>
          <p className="text-[13px] leading-5 text-muted">Đây là giá trị tài sản ước tính. Bạn cần bán tài sản để có tiền sử dụng cho mục tiêu.</p>
          <section><h3 className="mb-3 text-sm font-semibold text-text">Lịch sử định giá</h3><ol>{[{ date: asset.valuationDate, value: asset.value, label: "Gần nhất" }, ...(asset.costBasis !== asset.value ? [{ date: asset.createdAt, value: asset.costBasis, label: "Khai báo ban đầu" }] : [])].map((item, i, items) => <li key={`${item.date}-${i}`} className="flex gap-3"><div className="flex w-3 shrink-0 flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-source-self" : "bg-border"}`} />{i < items.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}</div><div className={`min-w-0 flex-1 ${i < items.length - 1 ? "pb-5" : ""}`}><div className="flex items-center justify-between gap-2"><p className="text-[12px] text-muted">{dateVi(item.date)} · {item.label}</p>{i === 0 && stale && <InfoTooltip warning label="giá trị đã cũ" text={`Giá trị được khai báo ngày ${dateVi(asset.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá để tiến độ mục tiêu sát thực tế.`} />}</div><p className="mt-1 text-sm font-semibold text-text">{formatVnd(item.value)}</p></div></li>)}</ol></section>
        </> : view === "menu" ? (
          <button type="button" onClick={() => setView("remove")} className={`flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left hover:bg-surface-muted ${ring}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-negative/10 text-negative"><Unlink size={20} aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text">Gỡ khỏi mục tiêu</span><span className="mt-1 block text-[13px] leading-5 text-muted">Ngừng tính giá trị tài sản vào tiến độ</span></span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
          </button>
        ) : <>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-muted p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-source-self-soft text-source-self">{asset.category === "car" ? <Car size={22} aria-hidden /> : <Package size={22} aria-hidden />}</span>
            <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-text">{asset.name}</p><p className="mt-1 text-[12px] text-muted">{goal?.name}</p></div>
          </div>
          <section className="rounded-2xl border border-border p-4">
            <p className="text-[13px] text-muted">Giá trị không còn tính vào mục tiêu</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums text-text">−{formatVnd(counted)}</p>
            {impact && <div className="mt-4 border-t border-border pt-3"><p className="mb-2 text-[13px] text-muted">Tiến độ mục tiêu</p><div className="flex items-center gap-4"><div><p className="text-[12px] text-muted">Hiện tại</p><p className="text-xl font-semibold text-text">{pct(impact.before)}</p></div><ArrowRight size={18} aria-hidden className="text-muted" /><div><p className="text-[12px] text-muted">Sau khi gỡ</p><p className="text-xl font-bold text-text">{pct(impact.after)}</p></div></div></div>}
          </section>
          <p className="flex items-start gap-2 text-[13px] leading-5 text-muted"><ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0" />Chỉ gỡ liên kết với mục tiêu. Tài sản không bị bán và tiền trong tài khoản không thay đổi.</p>
        </>}

      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface pb-[calc(16px+var(--safe-area-bottom,0px))] pt-3">
        {view === "detail" ? <button type="button" className={primaryButton} onClick={() => nav.push("RevalueAsset", { goalId: asset.goalId, assetId })}>Cập nhật giá</button> : <>
          <button type="button" className={secondaryButton} onClick={() => setView("detail")}>{view === "remove" ? "Giữ tài sản trong mục tiêu" : "Quay lại chi tiết"}</button>
          {view === "remove" && <button type="button" className={`${primaryButton} !bg-negative`} onClick={() => { dispatch({ type: "removeAsset", assetId }); toast("Đã gỡ tài sản khỏi mục tiêu.", "success"); onClose(); }}>Gỡ khỏi mục tiêu</button>}
        </>}
      </div>
    </Sheet>
  );
}
