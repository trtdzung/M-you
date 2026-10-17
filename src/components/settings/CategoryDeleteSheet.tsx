"use client";

import { useState } from "react";
import type { StoredCategory } from "@/domain/models";
import { useCategories } from "@/state/categories";
import { Sheet } from "@/components/primitives";

/**
 * Xoá một danh mục người dùng tự tạo — sheet HAI TRẠNG THÁI, cố ý không bao giờ
 * là ngõ cụt:
 *
 *  1. Xác nhận: nêu đích danh danh mục sắp xoá.
 *  2. Server từ chối vì danh mục còn được dùng (`409 { usedBy }`) → CHÍNH sheet
 *     này đổi sang lời mời ẩn danh mục, kèm đúng con số server trả về.
 *
 * Con số đó lấy từ `mutationUsedBy` (nguyên văn `usedBy` của server), không đếm
 * lại ở client: client chỉ thấy các correction đang nạp trong phiên, đếm lại sẽ
 * ra một số khác con số vừa dùng để từ chối (bất biến #6).
 *
 * Ẩn KHÔNG phải xoá: danh mục rời khỏi các bộ chọn nhưng giữ nguyên hũ và nhãn,
 * nên không một con số đã hiển thị nào thay đổi — copy nói rõ "lịch sử vẫn giữ
 * nhãn này".
 */
export function CategoryDeleteSheet({
  category,
  onClose,
}: {
  category: StoredCategory;
  onClose: () => void;
}) {
  const { removeCategory, setArchived, mutationError, mutationUsedBy, clearMutationError } = useCategories();
  const [busy, setBusy] = useState(false);
  /** Chỉ đọc lỗi của provider khi lượt ghi VỪA RỒI là của sheet này. */
  const [refused, setRefused] = useState(false);
  const usedBy = refused ? mutationUsedBy : null;

  function close() {
    clearMutationError();
    onClose();
  }

  async function run(op: () => Promise<boolean>) {
    setBusy(true);
    const ok = await op();
    setBusy(false);
    if (ok) close();
    else setRefused(true);
  }

  if (usedBy != null) {
    return (
      <Sheet title="Không xoá được danh mục" description={category.label} onClose={close}>
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-row bg-surface-muted px-3 py-2.5 text-sm text-text">
            Đang dùng ở {usedBy} giao dịch nên không xoá được. Bạn có thể ẩn danh mục — lịch sử vẫn giữ
            nhãn này.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => setArchived(category.id, true))}
              className="min-h-11 flex-1 rounded-full bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Ẩn danh mục
            </button>
            <button
              type="button"
              onClick={close}
              className="min-h-11 flex-1 rounded-full border border-border px-3 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Huỷ
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Xoá danh mục" description={category.label} onClose={close}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text">
          Xoá danh mục “{category.label}”? Danh mục sẽ biến mất khỏi mọi bộ chọn và không khôi phục được.
        </p>
        {refused && mutationError && (
          <p role="alert" className="rounded-row bg-negative-soft/40 px-3 py-2 text-sm text-negative">
            {mutationError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removeCategory(category.id))}
            className="min-h-11 flex-1 rounded-full bg-negative px-3 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Xoá danh mục
          </button>
          <button
            type="button"
            onClick={close}
            className="min-h-11 flex-1 rounded-full border border-border px-3 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Huỷ
          </button>
        </div>
      </div>
    </Sheet>
  );
}
