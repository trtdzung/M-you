"use client";

import { useState } from "react";
import { MoreVertical, Unlink } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { daysBetween } from "../../../engine";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectAsset } from "../../../store/selectors";
import { Amount, ConfirmSheet, EmptyState, MoneyInput, ScreenHeader, SliderRow, SourceTag } from "../../shared";
import { card, hint, input, label, primaryButton, screenPadding, sectionTitle, ring, listRow } from "../../shared/styles";
import { dateVi, findGoal, pct, progressAfter } from "./helpers";

/** Định giá lại tài sản cố định, hoặc bỏ khỏi mục tiêu. */
export function RevalueAsset({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const asset = selectAsset(state, paramString(params, "assetId"));
  const goal = findGoal(state, asset?.goalId);
  const today = state.clock.today;

  const [value, setValue] = useState<number | null>(asset?.value ?? null);
  const [date, setDate] = useState(today);
  const [percent, setPercent] = useState(asset?.countPercent ?? 100);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!asset || asset.type !== "fixed" || !goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Định giá lại" />
        <EmptyState title="Không tìm thấy tài sản" description="Chỉ định giá lại được tài sản cố định." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const ageDays = daysBetween(asset.valuationDate, today);
  const newValue = value ?? asset.value;
  const diff = newValue - asset.value;
  const oldCounted = Math.round((asset.value * asset.countPercent) / 100);
  const newCounted = Math.round((newValue * percent) / 100);
  const delta = newCounted - oldCounted;
  const progress = progressAfter(state, goal, delta);
  const changed = value !== null && value > 0 && (value !== asset.value || percent !== asset.countPercent);
  const valid = changed && date <= today && date !== "";

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Định giá lại" subtitle={asset.name} right={<button type="button" aria-label="Tuỳ chọn tài sản" onClick={() => setMenu(true)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-surface/80 ${ring}`}><MoreVertical size={22} aria-hidden /></button>} />

      <section className={cn(card, "flex flex-col gap-3")}>
        <div className="flex items-center justify-between gap-2"><p className="text-[13px] text-muted">Giá trị hiện tại · {FIXED_CATEGORY_LABEL[asset.category]}</p><SourceTag source="self_reported" /></div>
        <Amount amount={asset.value} className="text-[26px] font-bold text-text" />
        <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <div className="flex items-center justify-between gap-2"><dt className="text-muted">Cập nhật lần cuối</dt><dd className="flex items-center gap-1"><span>{dateVi(asset.valuationDate)}</span>{ageDays > 365 && <InfoTooltip warning label="giá trị đã cũ" text="Giá trị này được cập nhật hơn một năm trước. Hãy nhập giá hiện tại để tính lại tiến độ mục tiêu." />}</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-muted">Tính vào mục tiêu ({asset.countPercent}%)</dt><dd className="font-semibold text-text whitespace-nowrap">{formatVnd(oldCounted)}</dd></div>
        </dl>
      </section>

      <section className={cn(card, "flex flex-col gap-4")}>
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>Giá trị mới</h2>
        </div>
        <MoneyInput label="Giá trị ước tính mới" value={value} onChange={setValue} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reval-date" className={label}>
            Ngày định giá
          </label>
          <input id="reval-date" type="date" className={input} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <SliderRow label="Tỷ lệ được tính vào mục tiêu" value={percent} min={0} max={100} step={10} onChange={setPercent} format={(v) => `${v}%`} />
      </section>

      <section className={cn(card, "flex flex-col gap-4")}>
        <h2 className={sectionTitle}>Ảnh hưởng đến mục tiêu</h2>
        <div className="rounded-2xl bg-surface-muted p-3">
          <p className="text-[13px] text-muted">Tiến độ sau cập nhật</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[26px] font-bold text-text">{pct(progress.after)}</span>
            <span className="text-sm text-muted">{delta === 0 ? "Không thay đổi" : `Trước: ${pct(progress.before)}`}</span>
          </div>
        </div>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1"><dt className="text-muted">Giá trị được tính vào mục tiêu</dt><dd className="font-semibold text-text">{formatVnd(newCounted)}</dd>{delta !== 0 && <dd className="text-[12px] text-muted">Trước: {formatVnd(oldCounted)}</dd>}</div>
          <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted">Thay đổi giá tài sản</dt><dd className={cn("font-semibold", diff > 0 ? "text-positive" : diff < 0 ? "text-negative" : "text-text")}>{diff === 0 ? "Không thay đổi" : `${diff > 0 ? "+" : ""}${formatVnd(diff)}`}</dd></div>
        </dl>
      </section>

      <section className={cn(card, "flex flex-col gap-4")}>
        <h2 className={sectionTitle}>Lịch sử định giá</h2>
        <ol>
          {[
            { date: asset.valuationDate, value: asset.value, title: "Ghi nhận gần nhất" },
            ...(asset.costBasis !== asset.value ? [{ date: asset.createdAt, value: asset.costBasis, title: "Khai báo ban đầu" }] : []),
          ].map((item, index, items) => (
            <li key={`${item.date}-${index}`} className="flex gap-3">
              <div className="flex w-3 shrink-0 flex-col items-center"><span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", index === 0 ? "bg-primary" : "border-2 border-border bg-surface")} />{index < items.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}</div>
              <div className={cn("min-w-0 flex-1", index < items.length - 1 && "pb-5")}>
                <p className="text-[12px] text-muted">{dateVi(item.date)} · {item.title}</p>
                <p className="mt-1 text-[16px] font-semibold text-text">{formatVnd(item.value)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className={hint}>Bản xem trước chỉ lưu giá khai báo ban đầu và giá gần nhất.</p>
      </section>

      <Sheet open={menu} title="Tuỳ chọn tài sản" onClose={() => setMenu(false)}>
        <button type="button" className={`${listRow} rounded-2xl text-negative`} onClick={() => { setMenu(false); setConfirmRemove(true); }}><Unlink size={20} aria-hidden />Bỏ tài sản khỏi mục tiêu</button>
        <p className="mt-2 text-sm leading-5 text-muted">Tài sản không bị bán. Giá trị của tài sản sẽ không còn được tính vào mục tiêu này.</p>
      </Sheet>

      <div className="pt-2 pb-4">
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          Cập nhật giá trị
        </button>
      </div>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận định giá lại"
        description="Giá cũ và giá mới đều là giá trị bạn tự khai."
        rows={[
          { label: "Giá cũ", value: asset.value },
          { label: "Giá mới", value: newValue, emphasis: true },
          { label: "Ngày định giá", value: dateVi(date) },
          { label: "Tỷ lệ tính vào mục tiêu", value: `${percent}%` },
          { label: "Tiến độ mục tiêu", value: `${pct(progress.before)} → ${pct(progress.after)}` },
        ]}
        confirmLabel="Cập nhật"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "revalueAsset", assetId: asset.id, value: newValue, countPercent: percent, valuationDate: date });
          nav.pop();
        }}
      />
      <ConfirmSheet
        open={confirmRemove}
        danger
        title="Bỏ tài sản khỏi mục tiêu?"
        description="Tài sản không bị bán, chỉ không còn được tính vào mục tiêu này."
        rows={[
          { label: "Tài sản", value: asset.name },
          { label: "Phần đang tính", value: oldCounted, source: "self_reported" },
          { label: "Tiến độ mục tiêu", value: `${pct(progress.before)} → ${pct(progressAfter(state, goal, -oldCounted).after)}` },
        ]}
        confirmLabel="Bỏ khỏi mục tiêu"
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          dispatch({ type: "removeAsset", assetId: asset.id });
          nav.pop();
        }}
      />
    </div>
  );
}
