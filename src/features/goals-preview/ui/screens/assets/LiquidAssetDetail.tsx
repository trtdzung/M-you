"use client";

import { AlertTriangle } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { getInvestProduct } from "../../../data/products";
import { assetGain, assetValue, daysBetween, depositAccrued, fundPriceAt, formatISOMonth } from "../../../engine";
import { LIQUID_CATEGORY_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectAsset } from "../../../store/selectors";
import { Amount, EmptyState, ScreenHeader, SourceTag, SummaryRows } from "../../shared";
import { card, hint, primaryButton, progressTrack, screenPadding, secondaryButton, sectionTitle, warningBox } from "../../shared/styles";
import { dateVi, findGoal } from "./helpers";

/** Chi tiết tài sản linh hoạt (sản phẩm MSB). */
export function LiquidAssetDetail({ params, embedded = false, onNavigate }: ScreenProps & { embedded?: boolean; onNavigate?: () => void }) {
  const { state, nav } = usePreview();
  const asset = selectAsset(state, paramString(params, "assetId"));
  const goal = findGoal(state, asset?.goalId);

  if (!asset || asset.type !== "liquid" || !goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Chi tiết tài sản" />
        <EmptyState title="Không tìm thấy tài sản" description="Tài sản có thể đã được bán." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const go = (screen: "SellAsset" | "MaturityChoice") => {
    onNavigate?.();
    nav.push(screen, { assetId: asset.id });
  };
  const today = state.clock.today;
  const product = getInvestProduct(asset.productId);
  const value = assetValue(asset, state);
  const gain = assetGain(asset, state);
  const gainPct = asset.costBasis > 0 ? (gain / asset.costBasis) * 100 : 0;
  const matured = asset.status === "matured" || (asset.category === "term_deposit" && asset.status === "held" && !!asset.maturityDate && asset.maturityDate <= today);
  const afterTarget = !!asset.maturityDate && asset.maturityDate > goal.targetDate;
  const isDeposit = asset.category === "term_deposit" || asset.category === "savings";
  const gainTone = gain > 0 ? "text-positive" : gain < 0 ? "text-negative" : "text-text";

  // chart data (fund) -------------------------------------------------
  let chart: { label: string; price: number }[] = [];
  if (asset.category === "fund" && product?.kind === "fund") {
    const shift = state.market.fundPriceShiftPct;
    const pts = product.priceSeries.filter((p) => p.date <= today && p.date >= asset.createdAt.slice(0, 7) + "-01");
    chart = pts.map((p) => ({ label: formatISOMonth(p.date), price: Math.round(p.price * (1 + shift / 100)) }));
    chart.push({ label: "Nay", price: fundPriceAt(product, today, shift) });
    if (chart.length < 2) chart = [{ label: formatISOMonth(asset.createdAt), price: asset.price ?? chart[0]?.price ?? 0 }, ...chart];
  }

  const termTotal = asset.maturityDate ? Math.max(1, daysBetween(asset.createdAt, asset.maturityDate)) : 0;
  const termDone = asset.maturityDate ? Math.min(1, Math.max(0, daysBetween(asset.createdAt, today) / termTotal)) : 0;
  const atMaturity =
    asset.principal !== undefined && asset.maturityDate ? asset.principal + depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, asset.maturityDate) : undefined;

  const rows = [
    { label: "Loại", value: LIQUID_CATEGORY_LABEL[asset.category] },
    ...(asset.units !== undefined ? [{ label: "Số lượng", value: `${asset.units.toLocaleString("vi-VN")} ${asset.category === "bond" ? "trái phiếu" : "chứng chỉ quỹ"}` }] : []),
    ...(asset.price !== undefined && asset.category === "fund"
      ? [{ label: "Giá hiện tại / đơn vị", value: <Amount amount={chart.length ? chart[chart.length - 1].price : asset.price} source="msb" /> }]
      : []),
    ...(asset.ratePa !== undefined ? [{ label: asset.category === "bond" ? "Lãi trái phiếu" : "Lãi suất", value: `${String(asset.ratePa).replace(".", ",")}%/năm` }] : []),
    { label: "Giá vốn", value: asset.costBasis, source: "msb" as const },
    { label: "Giá trị hiện tại", value, source: "msb" as const, emphasis: true },
  ];

  return (
    <div className={screenPadding}>
      {!embedded && <ScreenHeader title={asset.name} subtitle={`${LIQUID_CATEGORY_LABEL[asset.category]} · ${goal.name}`} />}

      <section className={cn(card, "flex flex-col gap-1")}>
        <p className="text-[13px] text-muted">Giá trị hiện tại</p>
        <Amount amount={value} source="msb" className="text-3xl font-bold" />
        <p className={cn("text-sm font-semibold tabular-nums", gainTone)}>
          {gain > 0 ? "+" : ""}
          {formatVnd(gain)} ({gain > 0 ? "+" : ""}
          {(Math.round(gainPct * 100) / 100).toString().replace(".", ",")}%){" "}
          <span className="font-normal text-muted">{gain >= 0 ? "lãi" : "lỗ"} so với giá vốn</span>
        </p>
        {asset.category === "fund" && <p className={hint}>Giá chứng chỉ quỹ thay đổi hằng ngày, không cam kết lợi nhuận.</p>}
      </section>

      <SummaryRows rows={rows} />

      {chart.length > 1 && (
        <section className={cn(card, "flex flex-col gap-2")}>
          <h2 className={sectionTitle}>Giá chứng chỉ quỹ từ lúc mua</h2>
          <div className="h-40 w-full" aria-label="Biểu đồ giá chứng chỉ quỹ">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip formatter={(v: number) => formatVnd(v)} labelStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="price" stroke="var(--color-primary)" fill="var(--color-primary-soft)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            Giá do MSB cung cấp <SourceTag source="msb" />
          </p>
        </section>
      )}

      {isDeposit && asset.principal !== undefined && (
        <section className={cn(card, "flex flex-col gap-2")}>
          <h2 className={sectionTitle}>Lãi tích luỹ</h2>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Lãi đến hôm nay</span>
            <Amount amount={value - asset.principal} source="msb" className="font-semibold text-positive" />
          </div>
          {asset.maturityDate && (
            <>
              <div className={progressTrack} aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(termDone * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[12px] text-muted">
                <span>Gửi {dateVi(asset.createdAt)}</span>
                <span>Đáo hạn {dateVi(asset.maturityDate)}</span>
              </div>
              {atMaturity !== undefined && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">Nhận khi đáo hạn (dự kiến)</span>
                  <Amount amount={atMaturity} source="estimated" className="font-semibold" />
                </div>
              )}
            </>
          )}
        </section>
      )}

      {asset.maturityDate && (
        <section className={cn(card, "flex flex-col gap-1.5")}>
          <h2 className={sectionTitle}>Đáo hạn và ngày mục tiêu</h2>
          <p className="text-sm text-text">
            Đáo hạn {dateVi(asset.maturityDate)} · ngày mục tiêu {dateVi(goal.targetDate)}
          </p>
          {afterTarget && (
            <p className={cn(warningBox, "flex items-start gap-2")}>
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <span>Khoản này đáo hạn sau ngày mục tiêu. Nếu cần tiền đúng hạn, bạn phải tất toán sớm và có thể mất lãi.</span>
            </p>
          )}
        </section>
      )}

      {matured && <p className={cn(warningBox)}>Khoản tiền gửi đã đáo hạn. Hãy chọn tái tục hoặc chuyển tiền về tài khoản mục tiêu.</p>}

      <div className="flex flex-col gap-2 pt-2">
        {matured && asset.category === "term_deposit" ? (
          <>
            <button type="button" className={primaryButton} onClick={() => go("MaturityChoice")}>
              Xử lý khoản đáo hạn
            </button>
            <button type="button" className={secondaryButton} onClick={() => go("SellAsset")}>
              Tất toán
            </button>
          </>
        ) : (
          <button type="button" className={primaryButton} onClick={() => go("SellAsset")}>
            {asset.category === "fund" || asset.category === "bond" ? "Bán" : "Tất toán"}
          </button>
        )}
      </div>
    </div>
  );
}
