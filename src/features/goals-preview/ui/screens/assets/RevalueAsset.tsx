"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { daysBetween } from "../../../engine";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectAsset } from "../../../store/selectors";
import { Amount, BottomActions, ConfirmSheet, EmptyState, MoneyInput, ScreenHeader, SliderRow, SourceTag } from "../../shared";
import { card, dangerButton, hint, input, label, primaryButton, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
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
      <ScreenHeader title="Định giá lại" subtitle={asset.name} />

      <section className={cn(card, "flex flex-col gap-2")}>
        <p className="text-[13px] text-muted">{FIXED_CATEGORY_LABEL[asset.category]} · giá trị hiện ghi nhận</p>
        <Amount amount={asset.value} source={asset.source} className="text-2xl font-bold" />
        <p className={hint}>
          Định giá ngày {dateVi(asset.valuationDate)} ({ageDays <= 0 ? "hôm nay" : `${ageDays} ngày trước`}). Đang tính {asset.countPercent}% vào mục tiêu.
        </p>
        {ageDays > 365 && <p className={warningBox}>Giá này đã hơn 12 tháng. Hãy cập nhật để tiến độ mục tiêu sát thực tế.</p>}
      </section>

      <section className={cn(card, "flex flex-col gap-4")}>
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>Giá trị mới</h2>
          <SourceTag source="self_reported" />
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

      <section className={cn(card, "flex flex-col gap-1.5")}>
        <h2 className={sectionTitle}>Ảnh hưởng đến mục tiêu</h2>
        <p className="text-sm text-text">
          Thay đổi giá trị:{" "}
          <b className={diff > 0 ? "text-positive" : diff < 0 ? "text-negative" : ""}>
            {diff > 0 ? "+" : ""}
            {formatVnd(diff)}
          </b>
        </p>
        <p className="text-sm text-text">
          Phần tính vào mục tiêu: {formatVnd(oldCounted)} → <b>{formatVnd(newCounted)}</b> <SourceTag source="self_reported" className="align-middle" />
        </p>
        <p className="text-sm text-text">
          Tiến độ: {pct(progress.before)} → <b>{pct(progress.after)}</b>
        </p>
      </section>

      <section className={cn(card, "flex flex-col gap-2")}>
        <h2 className={sectionTitle}>Lịch sử định giá</h2>
        <ul className="divide-y divide-border text-sm">
          <li className="flex items-center justify-between py-2.5">
            <span className="text-muted">{dateVi(asset.valuationDate)} · mới nhất</span>
            <Amount amount={asset.value} source={asset.source} />
          </li>
          {asset.costBasis !== asset.value && (
            <li className="flex items-center justify-between py-2.5">
              <span className="text-muted">{dateVi(asset.createdAt)} · lần khai đầu</span>
              <Amount amount={asset.costBasis} source="self_reported" />
            </li>
          )}
        </ul>
        <p className={hint}>Bản xem trước chỉ lưu giá lúc khai đầu và giá mới nhất.</p>
      </section>

      <button type="button" className={dangerButton} onClick={() => setConfirmRemove(true)}>
        Bỏ tài sản khỏi mục tiêu
      </button>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          Cập nhật giá trị
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận định giá lại"
        rows={[
          { label: "Giá cũ", value: asset.value, source: "self_reported" },
          { label: "Giá mới", value: newValue, source: "self_reported", emphasis: true },
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
