"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { DeclaredAssetDetailSheet, priceDateOf } from "../assets/DeclaredAssetDetailSheet";
import { MsbAssetDetail } from "../assets/MsbAssetDetail";
import { ArrowRight, ChevronRight, Plus, Landmark, Car, Package, Unlink, Gem, CircleDollarSign, PieChart, FileText, Home } from "lucide-react";
import { getInstrument } from "../../../data/market";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { assetGain, assetValue, formatISODate, goalAssets, isAutoValued } from "../../../engine";
import { DECLARED_CATEGORY_LABEL, MSB_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { SourceTag } from "../../shared/SourceTag";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, ring, primaryButton, secondaryButton, sectionTitle, figure } from "../../shared/styles";
import { pct, progressAfter } from "../assets/helpers";
import { canTransact, isStaleValuation, type GoalContext } from "./common";

export function AssetsTab({ ctx, goalId }: { ctx: GoalContext; goalId: string }) {
  const { nav, dispatch, toast } = usePreview();
  const [removeId, setRemoveId] = useState<string | null>(null);
  const declaredDetailId = typeof nav.current.params.declaredAssetId === "string" ? nav.current.params.declaredAssetId : null;
  const setDeclaredDetailId = (id: string | null) => nav.updateParams({ declaredAssetId: id ?? undefined });
  const [detailId, setDetailId] = useState<string | null>(null);
  const { state, goal } = ctx;
  const assets = goalAssets(state, goalId);
  const msb = assets.flatMap((a) => (a.type === "msb" ? [a] : []));
  const declared = assets.flatMap((a) => (a.type === "declared" ? [a] : []));

  const removing = declared.find((asset) => asset.id === removeId);
  const removedValue = removing ? Math.round(assetValue(removing, state) * removing.countPercent / 100) : 0;
  const impact = removing ? progressAfter(state, goal, -removedValue) : null;

  return (
    <div className="flex flex-col gap-4">
      <Sheet open={!!removing} title="Gỡ tài sản khỏi mục tiêu?" onClose={() => setRemoveId(null)}>
        {removing && impact && <div className="flex flex-col gap-4">
          <div><p className="text-sm font-semibold text-text">{removing.name}</p><p className="mt-1 text-[13px] text-muted">{goal.name}</p></div>
          <dl className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Giá trị gỡ khỏi mục tiêu</dt><dd className="font-semibold text-text">−{formatVnd(removedValue)}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3"><dt className="text-muted">Tiến độ sau khi gỡ</dt><dd className="flex items-center gap-2 font-semibold text-text"><span>{pct(impact.before)}</span><ArrowRight size={15} aria-hidden /><span>{pct(impact.after)}</span></dd></div>
          </dl>
          <p className="text-[13px] leading-5 text-muted">Chỉ ngừng tính tài sản này vào mục tiêu. Tài sản không bị bán, tiền trong tài khoản không thay đổi.</p>
          <div className="grid grid-cols-2 gap-3"><button type="button" className={secondaryButton} onClick={() => setRemoveId(null)}>Huỷ</button><button type="button" className={`${primaryButton} !bg-negative`} onClick={() => { dispatch({ type: "removeAsset", assetId: removing.id }); setRemoveId(null); toast("Đã gỡ tài sản khỏi mục tiêu.", "success"); }}>Xác nhận gỡ</button></div>
        </div>}
      </Sheet>
      {declaredDetailId && <DeclaredAssetDetailSheet assetId={declaredDetailId} onClose={() => setDeclaredDetailId(null)} />}
      <Sheet bodyClassName="flex flex-col !overflow-hidden !pb-0" open={detailId !== null} title={msb.find((asset) => asset.id === detailId)?.name ?? "Chi tiết tài sản"} onClose={() => setDetailId(null)}>
        {detailId && <MsbAssetDetail params={{ goalId, assetId: detailId }} embedded onNavigate={() => setDetailId(null)} />}
      </Sheet>
      <section className="flex flex-col gap-2">
        <div className="flex items-center">
          <h2 className={sectionTitle}>Tài sản</h2>
          <InfoTooltip label="tài sản" text="Gồm sản phẩm MSB (tiền gửi, quỹ, trái phiếu) và tài sản bạn tự khai hoặc ở nơi khác (nhà, xe, vàng, cổ phiếu…). Chỉ phần theo tỷ lệ tính vào mục tiêu được cộng vào tiến độ." />
        </div>
        {assets.length === 0 && (
          <div className={`${card} flex flex-col gap-2 text-center`}>
            <p className="text-sm text-muted">Chưa có tài sản nào. Đưa tiền nhàn rỗi vào tiết kiệm, quỹ hoặc trái phiếu, hoặc thêm tài sản bạn đang có.</p>
            <button type="button" className={secondaryButton} onClick={() => nav.push("InvestSuggest", { goalId })}>
              Xem gợi ý đầu tư
            </button>
          </div>
        )}
        {msb.length > 0 && (
          <ul className="flex flex-col gap-3">
            {msb.map((a) => {
              const gain = assetGain(a, state);
              return (
                <li key={a.id}>
                  <button type="button" className={`${card} flex w-full min-w-0 flex-col gap-3 text-left ${ring}`} onClick={() => setDetailId(a.id)}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong"><Landmark size={20} aria-hidden /></span>
                      <div className="min-w-0"><p className="text-[15px] font-semibold leading-5 text-text">{a.name}</p><p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">{MSB_CATEGORY_LABEL[a.category]} <SourceTag source={a.source} /></p></div>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Giá trị tính vào mục tiêu</p>
                      <p className={`mt-1 ${figure}`}>{formatVndCompact(Math.round(assetValue(a, state) * a.countPercent / 100))}</p>
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
        {declared.length > 0 && (
          <ul className="flex flex-col gap-3">
            {declared.map((a) => {
              const auto = isAutoValued(a);
              const stale = !auto && isStaleValuation(a.valuationDate, state.clock.today);
              const now = assetValue(a, state);
              const instrument = getInstrument(a.instrumentId);
              const Icon = { house: Home, car: Car, gold: Gem, stock: CircleDollarSign, external_fund: PieChart, deposit: Landmark, bond: FileText }[a.category as string] ?? Package;
              return (
                <li key={a.id} className="relative rounded-card bg-surface shadow-card">
                  <button type="button" className={`${card} !shadow-none flex w-full min-w-0 flex-col gap-3 text-left ${ring}`} onClick={() => setDeclaredDetailId(a.id)}>
                    <div className={`flex items-start gap-3 ${stale ? "pr-9" : ""}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-source-self-soft text-source-self"><Icon size={20} aria-hidden /></span>
                      <div className="min-w-0"><p className="text-[15px] font-semibold leading-5 text-text">{a.name}</p><p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">{DECLARED_CATEGORY_LABEL[a.category]} <SourceTag source={auto ? "estimated" : "self_reported"} /></p></div>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Giá trị tính vào mục tiêu</p>
                      <p className={`mt-1 ${figure}`}>{formatVndCompact(Math.round(now * a.countPercent / 100))}</p>
                      <p className="mt-1 text-[12px] text-muted">
                        {a.countPercent}% của {formatVndCompact(now)}
                        {instrument && a.quantity !== undefined ? ` · ${a.quantity.toLocaleString("vi-VN")} ${instrument.unit} theo giá hôm nay` : a.accrual ? " · gốc + lãi tới hôm nay" : " tự khai"}
                      </p>
                      {instrument && priceDateOf(instrument.priceSeries, state.clock.today) && (
                        <p className="mt-1 text-[12px] text-muted">Giá ngày {formatISODate(priceDateOf(instrument.priceSeries, state.clock.today))}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <p className="text-[12px] text-muted">{auto ? "Tự cập nhật hằng ngày" : `Định giá ${formatISODate(a.valuationDate)}`}</p>
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-strong">Chi tiết <ChevronRight size={16} aria-hidden /></span>
                    </div>
                  </button>
                  <div className="mx-4 border-t border-border"><button type="button" aria-label={`Gỡ ${a.name} khỏi mục tiêu`} onClick={() => setRemoveId(a.id)} className={`flex min-h-11 items-center gap-2 rounded-lg text-[13px] font-medium text-negative ${ring}`}><Unlink size={15} aria-hidden />Gỡ khỏi mục tiêu</button></div>
                  {stale && <div className="absolute right-2 top-2"><InfoTooltip warning label={`giá trị đã cũ của ${a.name}`} text={`Tài sản này được định giá ngày ${formatISODate(a.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá trị để tiến độ mục tiêu sát thực tế.`} /></div>}
                </li>
              );
            })}
          </ul>
        )}

        {canTransact(goal) && (
          <button type="button" className={secondaryButton} onClick={() => nav.push("AddAsset", { goalId })}>
            <Plus size={18} aria-hidden /> Thêm tài sản
          </button>
        )}
      </section>
    </div>
  );
}
