"use client";

import { useState } from "react";
import { Car, CircleDollarSign, FileText, Gem, Home, Landmark, Package, PieChart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/features/goals-preview/format-money";
import { assetNameFromInstrument, getInstrument, instrumentsOf } from "../../../data/market";
import { addMonths, outsideValue, seriesPriceAt, seriesPointAt, formatISODate } from "../../../engine";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import type { DeclaredAssetCategory } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { AmountCard, SuggestChip } from "../../shared/AmountCard";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { InstrumentPicker } from "../../shared/InstrumentPicker";
import { Switch } from "../../shared/Pickers";
import { BottomActions, ConfirmSheet, EmptyState, ScreenHeader, SliderRow, SourceTag } from "../../shared";
import { card, input, label, primaryButton, ring, screenPadding, sectionTitle } from "../../shared/styles";
import { findGoal, pct, progressAfter, dateVi } from "./helpers";
import { countedValue as wizardCounted, wizardAssets } from "../create/wizard";

type Valuation = "manual" | "market" | "accrual";

interface TypeDef {
  category: DeclaredAssetCategory;
  label: string;
  Icon: LucideIcon;
  placeholder: string;
  valuation: Valuation;
  /** Default % counted toward the goal (lower for volatile assets). */
  percent: number;
}

const PHYSICAL: TypeDef[] = [
  { category: "house", label: "Nhà, đất", Icon: Home, placeholder: "VD: Căn hộ Q7", valuation: "manual", percent: 100 },
  { category: "car", label: "Xe", Icon: Car, placeholder: "VD: Xe Mazda 3", valuation: "manual", percent: 100 },
  { category: "other", label: "Khác", Icon: Package, placeholder: "VD: Tài sản khác", valuation: "manual", percent: 100 },
];

const FINANCIAL: TypeDef[] = [
  { category: "gold", label: "Vàng", Icon: Gem, placeholder: "VD: Vàng cất ở nhà", valuation: "market", percent: 80 },
  { category: "stock", label: "Cổ phiếu", Icon: CircleDollarSign, placeholder: "VD: Tài khoản chứng khoán", valuation: "market", percent: 70 },
  { category: "external_fund", label: "Chứng chỉ quỹ", Icon: PieChart, placeholder: "VD: Quỹ mở ở công ty khác", valuation: "market", percent: 80 },
  { category: "deposit", label: "Tiền gửi NH khác", Icon: Landmark, placeholder: "VD: Sổ tiết kiệm Vietcombank", valuation: "accrual", percent: 100 },
  { category: "bond", label: "Trái phiếu", Icon: FileText, placeholder: "VD: Trái phiếu doanh nghiệp", valuation: "accrual", percent: 90 },
];

const TERMS: Record<"deposit" | "bond", number[]> = { deposit: [6, 12, 24, 36], bond: [12, 24, 36, 60] };

function TypeGrid({ title, types, value, onPick }: { title: string; types: TypeDef[]; value: DeclaredAssetCategory; onPick: (t: TypeDef) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {types.map((t) => (
          <button
            key={t.category}
            type="button"
            aria-pressed={value === t.category}
            onClick={() => onPick(t)}
            className={cn(
              "flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 text-left text-sm font-semibold transition-colors",
              ring,
              value === t.category ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-text hover:bg-surface-muted",
            )}
          >
            <t.Icon size={20} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const qtyGroup = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Số lượng hiển thị theo vi-VN, lưu thô với dấu chấm thập phân. */
function parseQtyInput(text: string, fractional: boolean): string {
  const t = text.replace(/\./g, "").replace(",", ".");
  if (!fractional) return t.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);
  const [whole = "", ...fraction] = t.replace(/[^\d.]/g, "").split(".");
  const digits = whole.replace(/^0+(?=\d)/, "").slice(0, 12);
  return fraction.length ? `${digits || "0"}.${fraction.join("").slice(0, 2)}` : digits;

}

/** Giữ nguyên phần thập phân đang gõ, dùng dấu chấm ngăn nghìn. */
function formatQtyInput(raw: string): string {
  if (raw === "") return "";
  const [int, dec] = raw.split(".");
  const grouped = int === "" ? "" : qtyGroup.format(Number(int));
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

/** Thêm tài sản ngoài MSB: tài sản vật chất (tự khai giá) hoặc tài sản tài chính ở nơi khác (tự định giá). */
export function AddAsset({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  // Chế độ tạo mục tiêu: chưa có mục tiêu, tài sản được gom vào tham số của màn trước (popWith).
  const wizard = paramString(params, "wizard") === "1";
  const existingGoal = findGoal(state, paramString(params, "goalId"));
  const wizardGoal = wizard
    ? { name: paramString(params, "name") ?? "Mục tiêu mới", target: paramNumber(params, "targetAmount") ?? 0, deposit: paramNumber(params, "deposit") ?? 0, assets: wizardAssets(params) }
    : undefined;
  const goal = existingGoal ?? (wizardGoal ? { id: "wizard", name: wizardGoal.name } : undefined);
  const today = state.clock.today;
  const shift = state.market.fundPriceShiftPct;

  const [type, setType] = useState<TypeDef>(PHYSICAL[0]);
  const [name, setName] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [instrumentId, setInstrumentId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState("");
  const [institution, setInstitution] = useState("");
  const [principal, setPrincipal] = useState<number | null>(null);
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [term, setTerm] = useState<number | undefined>();
  const [counted, setCounted] = useState(true);
  const [percent, setPercent] = useState(PHYSICAL[0].percent);
  const [confirm, setConfirm] = useState(false);
  /** Quỹ ngoài danh sách Fmarket → tự khai giá (category vẫn external_fund). */
  const [manualFund, setManualFund] = useState(false);

  if (!goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Thêm tài sản" />
        <EmptyState title="Không tìm thấy mục tiêu" description="Hãy quay lại và chọn một mục tiêu." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const pick = (t: TypeDef) => {
    setType(t);
    setPercent(t.percent);
    setInstrumentId(undefined);
    setQuantity("");
    setManualFund(false);
    setTerm(t.category === "deposit" || t.category === "bond" ? TERMS[t.category][1] : undefined);
  };

  const valuation: Valuation = manualFund ? "manual" : type.valuation;
  const instrument = getInstrument(instrumentId);
  const qty = Number(quantity);
  const ratePa = Number(rate.replace(",", "."));
  const accrual =
    valuation === "accrual" && principal && ratePa >= 0 && rate !== ""
      ? { principal, ratePa, startDate, maturityDate: term ? addMonths(startDate, term) : undefined }
      : undefined;
  const autoValue =
    valuation === "market"
      ? instrument && qty > 0
        ? outsideValue({ instrumentId, quantity: qty }, today, shift)
        : undefined
      : valuation === "accrual" && accrual
        ? outsideValue({ accrual }, today, shift)
        : undefined;
  const assetValue = valuation === "manual" ? value ?? 0 : autoValue ?? 0;

  const effPercent = counted ? percent : 0;
  const countedValue = Math.round((assetValue * effPercent) / 100);
  const progress = wizardGoal
    ? (() => {
        const base = wizardGoal.deposit + wizardGoal.assets.reduce((sum, a) => sum + wizardCounted(a), 0);
        const t = wizardGoal.target || 1;
        return { before: (base / t) * 100, after: ((base + countedValue) / t) * 100 };
      })()
    : progressAfter(state, existingGoal!, countedValue);
  const finalName =
    name.trim() ||
    (valuation === "market" && instrument ? assetNameFromInstrument(instrument) : valuation === "accrual" && institution.trim() ? `${type.label} · ${institution.trim()}` : type.label);
  const valid =
    valuation === "manual"
      ? value !== null && value > 0 && date !== "" && date <= today
      : valuation === "market"
        ? !!instrument && qty > 0
        : !!accrual && startDate <= today;
  const source = valuation === "manual" ? ("self_reported" as const) : ("estimated" as const);
  const priceDate = formatISODate(instrument ? seriesPointAt(instrument.priceSeries, today)?.date : undefined).slice(0, 5);
  const quoteTime = instrument?.quotedAt
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instrument.quotedAt))
    : undefined;
  const valueLabel = valuation === "manual" ? "Giá trị tự khai" : valuation === "market" ? `Giá trị ước tính theo giá ngày ${priceDate}` : "Giá trị ước tính hôm nay";
  const unitPrice = instrument ? seriesPriceAt(instrument.priceSeries, today, shift) : 0;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Thêm tài sản" subtitle={goal.name} />

      <section className={cn(card, "flex flex-col gap-4")} aria-label="Loại tài sản">
        <h2 className={sectionTitle}>Loại tài sản</h2>
        <TypeGrid title="Tài sản vật chất" types={PHYSICAL} value={type.category} onPick={pick} />
        <TypeGrid title="Tài sản tài chính" types={FINANCIAL} value={type.category} onPick={pick} />
      </section>

      {valuation === "manual" && (
        <section className={cn(card, "flex flex-col gap-4")} aria-label="Thông tin tài sản">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <h2 className={sectionTitle}>Giá trị ước tính</h2>
              <InfoTooltip
                label="giá tự khai"
                text={
                  manualFund
                    ? "Quỹ này chưa có giá tự động. Bạn tự khai giá trị hiện tại; MSB không xác minh."
                    : "Bạn tự khai, MSB không có giá thị trường cho tài sản này. Hãy khai sát với giá bán thực tế."
                }
              />
            </div>
            <SourceTag source="self_reported" />
          </div>
          <AmountCard bare title="Giá trị" value={value} onChange={setValue} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="asset-name" className={label}>Tên gọi</label>
            <input id="asset-name" className={input} value={name} maxLength={60} placeholder={manualFund ? "VD: Quỹ ABC tại công ty quản lý quỹ" : type.placeholder} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="asset-date" className={label}>Ngày định giá</label>
            <input id="asset-date" type="date" className={input} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            {date > today && <p className="text-sm text-negative">Ngày định giá không được ở tương lai.</p>}
          </div>
          {manualFund && (
            <button
              type="button"
              className="self-start text-[13px] font-semibold text-primary-strong"
              onClick={() => {
                setManualFund(false);
                setValue(null);
                setName("");
              }}
            >
              Chọn quỹ có giá tự động
            </button>
          )}
        </section>
      )}

      {valuation === "market" && (
        <section className={cn(card, "flex flex-col gap-4")} aria-label="Số lượng nắm giữ">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <h2 className={sectionTitle}>{type.category === "gold" ? "Loại vàng" : type.category === "stock" ? "Cổ phiếu" : "Quỹ"}</h2>
              <InfoTooltip
                label="cách định giá"
                text="Bạn chỉ khai số lượng. App tự tính giá trị theo giá thị trường hằng ngày. Nhớ sửa số lượng khi mua thêm hoặc bán bớt."
              />
            </div>
          </div>
          {type.category === "gold" ? (
            <div className="flex flex-wrap gap-2">
              {instrumentsOf("gold").map((m) => (
                <SuggestChip key={m.id} label={m.name} selected={m.id === instrumentId} onClick={() => setInstrumentId(m.id)} />
              ))}
            </div>
          ) : (
            <InstrumentPicker
              kind={type.category as "stock" | "external_fund"}
              value={instrumentId}
              onChange={setInstrumentId}
              today={today}
              shiftPct={shift}
              onManualFund={
                type.category === "external_fund"
                  ? () => {
                      setManualFund(true);
                      setInstrumentId(undefined);
                      setQuantity("");
                    }
                  : undefined
              }
            />
          )}
          {instrument && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="asset-qty" className={label}>Số lượng nắm giữ</label>
              <div className="flex items-baseline gap-2 rounded-2xl border border-border bg-surface-muted/40 px-3.5 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <input
                  id="asset-qty"
                  inputMode={instrument.fractional ? "decimal" : "numeric"}
                  className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tabular-nums text-text outline-none placeholder:text-muted"
                  placeholder="0"
                  value={formatQtyInput(quantity)}
                  onChange={(e) => setQuantity(parseQtyInput(e.target.value, instrument.fractional))}
                />
                <span className="shrink-0 text-sm font-semibold text-muted">{type.category === "stock" ? "cp" : instrument.unit}</span>
              </div>
              {type.category === "gold" && (
                <p className="text-[13px] text-muted">Giá mua vào{quoteTime ? ` lúc ${quoteTime}` : ""} ngày {priceDate}: {formatVnd(unitPrice)}/{instrument.unit}</p>
              )}
            </div>
          )}
          <div className="rounded-2xl bg-primary-soft px-4 py-3" aria-live="polite" aria-atomic="true">
            <p className="text-[13px] text-muted">Giá trị ước tính</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-text">{autoValue ? formatVnd(autoValue) : "—"}</p>
            <p className="mt-1 text-[12px] text-muted">{instrument ? `Theo giá ${type.category === "stock" ? "đóng cửa" : type.category === "gold" ? "mua vào" : "NAV"} ${priceDate}` : "Chọn tài sản và nhập số lượng để xem giá trị"}</p>
          </div>
        </section>
      )}

      {valuation === "accrual" && (
        <section className={cn(card, "flex flex-col gap-4")} aria-label="Thông tin khoản gửi">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <h2 className={sectionTitle}>{type.category === "deposit" ? "Khoản tiền gửi" : "Khoản trái phiếu"}</h2>
              <InfoTooltip label="cách định giá" text="App tự tính giá trị = gốc + lãi cộng dồn tới hôm nay (dừng ở ngày đáo hạn)." />
            </div>
            <SourceTag source="estimated" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="asset-inst" className={label}>{type.category === "deposit" ? "Ngân hàng" : "Tổ chức phát hành"}</label>
            <input id="asset-inst" className={input} value={institution} maxLength={40} placeholder={type.category === "deposit" ? "VD: Vietcombank" : "VD: Công ty ABC"} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <AmountCard bare title={type.category === "deposit" ? "Tiền gốc" : "Số tiền đã mua (mệnh giá)"} value={principal} onChange={setPrincipal} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="asset-rate" className={label}>Lãi suất (%/năm)</label>
              <input id="asset-rate" inputMode="decimal" className={input} value={rate} placeholder="VD: 5,5" onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="asset-start" className={label}>Ngày gửi / mua</label>
              <input id="asset-start" type="date" className={input} value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>Kỳ hạn</span>
            <div className="flex flex-wrap gap-2">
              {TERMS[type.category as "deposit" | "bond"].map((m) => (
                <SuggestChip key={m} label={`${m} tháng`} selected={m === term} onClick={() => setTerm(m)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {valuation === "accrual" && (
        <section className={cn(card, "flex items-center justify-between gap-3")} aria-label={valueLabel}>
          <span className="text-[13px] text-muted">{valueLabel}</span>
          <span className="text-[16px] font-bold tabular-nums text-text">{autoValue ? formatVnd(autoValue) : "—"}</span>
        </section>
      )}

      <section className={cn(card, "flex flex-col gap-3")} aria-label="Tính vào mục tiêu">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h2 className={sectionTitle}>Tính vào mục tiêu</h2>
            <InfoTooltip
              label="tỷ lệ tính vào mục tiêu"
              text="Chỉ bật nếu bạn định bán hoặc dùng tài sản này cho mục tiêu. Tài sản biến động mạnh (cổ phiếu, vàng, quỹ) nên tính một phần để phòng giá giảm."
            />
          </div>
          <Switch checked={counted} onChange={setCounted} label="Tính vào mục tiêu" />
        </div>
        {counted && <SliderRow label="Tỷ lệ được tính" value={percent} min={10} max={100} step={10} onChange={setPercent} format={(v) => `${v}%`} />}
        <div className="border-t border-border pt-3" aria-live="polite" aria-atomic="true">
          <p className="text-[13px] text-muted">Giá trị tính vào mục tiêu</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-text">{valid ? formatVnd(countedValue) : "—"}</p>
          <p className="mt-1 text-[13px] text-muted">Tiến độ {pct(progress.before)} → <b className="text-text">{pct(progress.after)}</b></p>
        </div>
      </section>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          Thêm tài sản
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận thêm tài sản"
        rows={[
          { label: "Mục tiêu", value: goal.name },
          { label: "Tài sản", value: finalName },
          ...(valuation === "market" && instrument ? [{ label: "Số lượng", value: `${formatQtyInput(quantity)} ${instrument.unit}` }] : []),
          { label: valueLabel, value: assetValue, source },
          ...(valuation === "manual" ? [{ label: "Ngày định giá", value: dateVi(date) }] : []),
          { label: "Tính vào mục tiêu", value: counted ? `${percent}%` : "Không tính" },
          { label: "Phần cộng vào mục tiêu", value: countedValue, source, emphasis: true },
        ]}
        confirmLabel="Thêm tài sản"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          const asset = {
            name: finalName,
            category: type.category,
            value: assetValue,
            countPercent: effPercent,
            valuationDate: valuation === "manual" ? date : today,
            source,
            ...(valuation === "market" ? { instrumentId, quantity: qty } : {}),
            ...(valuation === "accrual" ? { accrual, institution: institution.trim() || undefined } : {}),
          };
          if (wizardGoal) {
            nav.popWith({ assets: JSON.stringify([...wizardGoal.assets, asset]) });
            return;
          }
          dispatch({ type: "addAsset", goalId: goal.id, ...asset });
          nav.pop();
        }}
      />
    </div>
  );
}
