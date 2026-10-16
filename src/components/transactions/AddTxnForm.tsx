"use client";

import { useState } from "react";
import { Sheet, SegmentedControl } from "@/components/primitives";
import { useManualTxns } from "@/state/manual-txns";
import { DEMO_NOW } from "@/lib/demo-clock";
import { formatVnd } from "@/lib/format";
import { CategoryOptionGrid } from "./CategoryPickerSheet";

type Direction = "debit" | "credit";

/**
 * Thêm giao dịch thủ công (từ ＋ FAB). Đây là GHI NHẬN tự khai — KHÔNG execute,
 * confirm, hay chuyển tiền (invariant #3), không OTP/credential. Bản ghi mang
 * `source: self_reported` (không giả bank-verified — invariant #5). Danh mục bắt
 * buộc → hũ tự theo (exactly-one). Lưu qua `useManualTxns`, engine tính như GD
 * provider.
 */
export function AddTxnForm({ onClose }: { onClose: () => void }) {
  const { add } = useManualTxns();
  const [direction, setDirection] = useState<Direction>("debit");
  const [amountText, setAmountText] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [merchant, setMerchant] = useState("");

  const amount = Number(amountText.replace(/[^\d]/g, ""));
  const valid = amount > 0 && categoryId !== "" && merchant.trim() !== "";

  function submit() {
    if (!valid) return;
    add({
      amount,
      direction,
      categoryId,
      merchantName: merchant.trim(),
      postedAt: DEMO_NOW.toISOString(),
    });
    onClose();
  }

  return (
    <Sheet title="Thêm giao dịch" description="Ghi nhận thủ công — không chuyển tiền" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="Loại giao dịch"
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setCategoryId("");
          }}
          options={[
            { value: "debit", label: "Chi tiêu" },
            { value: "credit", label: "Thu nhập" },
          ]}
        />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Số tiền</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            aria-label="Số tiền"
            className="min-h-12 rounded-row border border-border bg-surface px-3 text-right text-lg font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          <span className="text-right text-xs text-muted">{amount > 0 ? formatVnd(amount) : "VND"}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Nội dung</span>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="VD: Ăn trưa, Lương tháng…"
            aria-label="Nội dung"
            className="min-h-12 rounded-row border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Danh mục</span>
          <CategoryOptionGrid selectedId={categoryId} kind={direction === "debit" ? "expense" : "income"} onSelect={setCategoryId} />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-row bg-surface-muted px-3 py-2 text-xs text-muted">
          <span>Nguồn</span>
          <span className="font-semibold text-text">Tự khai</span>
        </div>

        <button
          type="button"
          disabled={!valid}
          onClick={submit}
          className="min-h-12 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Lưu giao dịch
        </button>
      </div>
    </Sheet>
  );
}
