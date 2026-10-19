"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/features/goals-preview/format-money";
import { getInstrument } from "../../../data/market";
import { assetValue, isAutoValued, seriesPriceAt } from "../../../engine";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SourceTag } from "../../shared/SourceTag";
import { primaryButton, heroNumber, secondaryButton } from "../../shared/styles";
import { isStaleValuation } from "../detail/common";
import { dateVi } from "./helpers";

export function FixedAssetDetailSheet({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { state, nav, dispatch } = usePreview();
  const asset = state.assets.find((item) => item.id === assetId);
  const [editQty, setEditQty] = useState(false);
  const [qty, setQty] = useState("");
  if (!asset || asset.type !== "fixed") return null;

  const auto = isAutoValued(asset);
  const now = assetValue(asset, state);
  const counted = Math.round((now * asset.countPercent) / 100);
  const stale = !auto && isStaleValuation(asset.valuationDate, state.clock.today);
  const instrument = getInstrument(asset.instrumentId);
  const unitPrice = instrument ? seriesPriceAt(instrument.priceSeries, state.clock.today, state.market.fundPriceShiftPct) : 0;
  const newQty = Number(qty.replace(",", "."));

  return (
    <Sheet open title={asset.name} onClose={onClose} bodyClassName="flex flex-col !overflow-hidden !pb-0">
      <div className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{FIXED_CATEGORY_LABEL[asset.category]}</span>
          <SourceTag source={auto ? "estimated" : "self_reported"} />
        </div>
        <section className="rounded-2xl bg-source-self-soft p-4">
          <p className="text-[13px] text-muted">Giá trị tính vào mục tiêu</p>
          <p className={`mt-1 ${heroNumber}`}>{formatVnd(counted)}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {asset.countPercent}% của {formatVnd(now)}
            </p>
            <InfoTooltip
              label="tỷ lệ tính vào mục tiêu"
              text={
                auto
                  ? "Giá trị ước tính theo giá thị trường hoặc lãi suất, app tự cập nhật hằng ngày. Đây là tài sản ở nơi khác, không phải tiền sẵn có trong tài khoản mục tiêu."
                  : "Chỉ phần giá trị theo tỷ lệ bạn chọn được tính vào tiến độ. Đây là tài sản tự khai, không phải tiền sẵn có trong tài khoản."
              }
            />
          </div>
        </section>

        {instrument && asset.quantity !== undefined && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Cách tính</h3>
            <p className="text-sm tabular-nums text-text">
              {asset.quantity.toLocaleString("vi-VN")} {instrument.unit} × {formatVnd(unitPrice)} = <b>{formatVnd(now)}</b>
            </p>
            <p className="text-[12px] text-muted">Giá {instrument.name} hôm nay · số lượng xác nhận {dateVi(asset.valuationDate)}</p>
            {editQty && (
              <div className="flex items-baseline gap-2 border-b-2 border-border pb-1 focus-within:border-primary">
                <input
                  aria-label={`Số lượng mới (${instrument.unit})`}
                  inputMode={instrument.fractional ? "decimal" : "numeric"}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tabular-nums text-text outline-none placeholder:text-muted"
                  placeholder={String(asset.quantity)}
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(instrument.fractional ? /[^\d.,]/g : /\D/g, "").slice(0, 10))}
                />
                <span className="shrink-0 text-sm font-semibold text-muted">{instrument.unit}</span>
              </div>
            )}
          </section>
        )}

        {asset.accrual && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-text">Cách tính</h3>
            <p className="text-sm text-text">
              Gốc {formatVnd(asset.accrual.principal)} · lãi {String(asset.accrual.ratePa).replace(".", ",")}%/năm từ {dateVi(asset.accrual.startDate)}
              {asset.accrual.maturityDate ? ` · đáo hạn ${dateVi(asset.accrual.maturityDate)}` : ""}
            </p>
            {asset.institution && <p className="text-[12px] text-muted">Tại {asset.institution}</p>}
          </section>
        )}

        {!auto && (
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">Định giá gần nhất</h3>
              {stale && <InfoTooltip warning label="giá trị đã cũ" text={`Giá trị được khai báo ngày ${dateVi(asset.valuationDate)}, đã hơn 6 tháng. Hãy cập nhật giá để tiến độ mục tiêu sát thực tế.`} />}
            </div>
            <p className="mt-1 text-sm text-text">
              {formatVnd(asset.value)} · {dateVi(asset.valuationDate)}
            </p>
          </section>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface pb-[calc(16px+var(--safe-area-bottom,0px))] pt-3">
        {instrument ? (
          editQty ? (
            <button
              type="button"
              className={primaryButton}
              disabled={!(newQty > 0)}
              onClick={() => {
                dispatch({ type: "setAssetQuantity", assetId, quantity: newQty });
                setEditQty(false);
                setQty("");
              }}
            >
              Lưu số lượng
            </button>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setEditQty(true)}>
              Sửa số lượng (mua thêm / bán bớt)
            </button>
          )
        ) : !auto ? (
          <button type="button" className={primaryButton} onClick={() => nav.push("RevalueAsset", { goalId: asset.goalId, assetId })}>
            Cập nhật giá
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
