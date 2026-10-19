"use client";

import { useState } from "react";
import { Car, Gem, Home, Package, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { paramString, type ScreenProps } from "../../../model/screens";
import type { FixedAssetCategory } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions, ConfirmSheet, EmptyState, MoneyInput, ScreenHeader, SliderRow, SourceTag } from "../../shared";
import { card, hint, infoBox, input, label, primaryButton, ring, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { findGoal, pct, progressAfter, dateVi } from "./helpers";

const TYPES: { category: FixedAssetCategory; label: string; Icon: LucideIcon; placeholder: string }[] = [
  { category: "house", label: "Nhà, đất", Icon: Home, placeholder: "VD: Căn hộ Q7" },
  { category: "car", label: "Xe", Icon: Car, placeholder: "VD: Xe Mazda 3" },
  { category: "gold", label: "Vàng, trang sức", Icon: Gem, placeholder: "VD: Vàng cất ở nhà" },
  { category: "other", label: "Khác", Icon: Package, placeholder: "VD: Tài sản khác" },
];

/** Thêm tài sản cố định (tự khai). */
export function AddFixedAsset({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const goal = findGoal(state, paramString(params, "goalId"));
  const today = state.clock.today;

  const [category, setCategory] = useState<FixedAssetCategory>("house");
  const [name, setName] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [counted, setCounted] = useState(true);
  const [percent, setPercent] = useState(100);
  const [confirm, setConfirm] = useState(false);

  if (!goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Thêm tài sản" />
        <EmptyState title="Không tìm thấy mục tiêu" description="Hãy quay lại và chọn một mục tiêu." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const type = TYPES.find((t) => t.category === category) ?? TYPES[0];
  const finalName = name.trim() || type.label;
  const effPercent = counted ? percent : 0;
  const countedValue = Math.round(((value ?? 0) * effPercent) / 100);
  const progress = progressAfter(state, goal, countedValue);
  const valid = value !== null && value > 0 && date !== "" && date <= today;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Thêm tài sản" subtitle={goal.name} />

      <section className={cn(card, "flex flex-col gap-3")} aria-label="Loại tài sản">
        <h2 className={sectionTitle}>Loại tài sản</h2>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(({ category: c, label: l, Icon }) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3 text-left text-sm font-semibold transition-colors",
                ring,
                category === c ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-text hover:bg-surface-muted",
              )}
            >
              <Icon size={22} aria-hidden />
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className={cn(card, "flex flex-col gap-4")}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionTitle}>Thông tin tài sản</h2>
          <SourceTag source="self_reported" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="asset-name" className={label}>
            Tên gọi
          </label>
          <input id="asset-name" className={input} value={name} maxLength={60} placeholder={type.placeholder} onChange={(e) => setName(e.target.value)} />
        </div>
        <MoneyInput
          label="Giá trị ước tính"
          value={value}
          onChange={setValue}
          hint="Bạn tự khai, MSB không có giá thị trường cho tài sản này."
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="asset-date" className={label}>
            Ngày định giá
          </label>
          <input id="asset-date" type="date" className={input} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          {date > today && <p className="text-sm text-negative">Ngày định giá không được ở tương lai.</p>}
        </div>
      </section>

      <section className={cn(card, "flex flex-col gap-3")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={sectionTitle}>Tính vào mục tiêu</h2>
            <p className={hint}>Chỉ bật nếu bạn định bán hoặc dùng tài sản này cho mục tiêu.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={counted}
            aria-label="Tính vào mục tiêu"
            onClick={() => setCounted((v) => !v)}
            className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors", ring, counted ? "bg-primary" : "bg-border")}
          >
            <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", counted ? "left-7" : "left-1")} />
          </button>
        </div>
        {counted ? (
          <>
            <SliderRow label="Tỷ lệ được tính" value={percent} min={10} max={100} step={10} onChange={setPercent} format={(v) => `${v}%`} />
            <p className={hint}>Ví dụ: nhà trị giá 3 tỷ, tính 30% thì mục tiêu chỉ ghi nhận 900 triệu.</p>
          </>
        ) : (
          <p className={hint}>Tài sản chỉ được lưu để theo dõi, không cộng vào tiến độ mục tiêu.</p>
        )}
        <div className={infoBox}>
          <p>
            Phần được tính: <b>{formatVnd(countedValue)}</b> <SourceTag source="self_reported" className="align-middle" />
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Tiến độ mục tiêu: {pct(progress.before)} → <b className="text-text">{pct(progress.after)}</b>
          </p>
        </div>
        {countedValue > 0 && (
          <p className={warningBox}>Giá trị này do bạn tự khai nên chưa được MSB xác nhận. Hãy khai sát với giá bán thực tế.</p>
        )}
      </section>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          Tiếp tục
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận thêm tài sản"
        rows={[
          { label: "Mục tiêu", value: goal.name },
          { label: "Tài sản", value: finalName },
          { label: "Giá trị tự khai", value: value ?? 0, source: "self_reported" },
          { label: "Ngày định giá", value: dateVi(date) },
          { label: "Tính vào mục tiêu", value: counted ? `${percent}%` : "Không tính" },
          { label: "Phần cộng vào mục tiêu", value: countedValue, source: "self_reported", emphasis: true },
        ]}
        confirmLabel="Thêm tài sản"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({
            type: "addFixedAsset",
            goalId: goal.id,
            name: finalName,
            category,
            value: value ?? 0,
            countPercent: effPercent,
            valuationDate: date,
            source: "self_reported",
          });
          nav.pop();
        }}
      />
    </div>
  );
}
