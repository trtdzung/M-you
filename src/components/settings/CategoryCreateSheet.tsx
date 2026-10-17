"use client";

import { useState } from "react";
import { KHAC_JAR_LABEL } from "@/domain/engine";
import {
  MAX_CATEGORY_LABEL,
  labelConflict,
  normalizeCategoryLabel,
  slugCategoryId,
  uniqueCategoryId,
} from "@/domain/models/category-rules";
import { useCategories } from "@/state/categories";
import { Sheet } from "@/components/primitives";
import { CATEGORY_COLOR_FALLBACK, categoryColor } from "@/lib/category-colors";

const DUPLICATE_LABEL = "Tên danh mục đã tồn tại. Hãy chọn tên khác.";
const INVALID_LABEL = `Tên danh mục cần từ 1 đến ${MAX_CATEGORY_LABEL} ký tự.`;

/**
 * Tạo một danh mục chi của NGƯỜI DÙNG. Mở từ hai chỗ: bộ chọn danh mục của giao
 * dịch và màn "Quản lý danh mục" — cả hai không kèm `jarId`, nên danh mục mới ở
 * "Chưa xếp hũ". (Trình sửa hũ KHÔNG còn tạo danh mục; `jarId` vẫn được server
 * hỗ trợ, chỉ là không có chỗ nào trong UI truyền vào nữa.)
 *
 * MỘT lượt ghi duy nhất: `POST /api/categories { label, fixed, jarId }`. Sheet này
 * KHÔNG bao giờ tự ghi `categoryIds` của hũ — nếu tạo (chưa xếp hũ) rồi chuyển sang
 * hũ đích thì đó là hai lượt ghi, một khoảng nhấp nháy, và là cửa ghi THỨ BA có
 * thể làm vỡ bất biến "mỗi danh mục tối đa một hũ". Hai cửa hợp lệ chỉ gồm POST này
 * và `PATCH /api/jars/:id` trọn tập của `HuCategoryPicker`.
 *
 * Kiểm tra trùng tên phía client chỉ để đỡ một vòng mạng: server mới là trọng
 * tài (409), và sheet vẫn phải xử lý 409 kể cả khi client đã cho qua — taxonomy
 * trong tay client có thể cũ (hai tab, một lượt ghi vừa xong ở nơi khác).
 */
export function CategoryCreateSheet({
  jarId,
  jarLabel,
  onCreated,
  onClose,
}: {
  /** Hũ nhận danh mục mới. Bỏ trống = danh mục chưa xếp hũ. */
  jarId?: string;
  /** Tên hũ đích, chỉ để hiển thị. */
  jarLabel?: string;
  /** Danh mục vừa tạo (id THẬT lấy từ taxonomy đã cập nhật, không phải id đoán). */
  onCreated?: (categoryId: string) => void;
  onClose: () => void;
}) {
  const { categories, addCategory, mutationError } = useCategories();
  const [raw, setRaw] = useState("");
  const [fixed, setFixed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** True khi lượt ghi VỪA RỒI của sheet này bị từ chối — mới được đọc `mutationError`. */
  const [refused, setRefused] = useState(false);
  /** Nhãn đã tạo xong; dùng để tra lại hàng thật trong taxonomy vừa cập nhật. */
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);
  /**
   * Mốc thời gian cố định cho lần mở sheet này. `slugCategoryId` chỉ dùng nó khi
   * nhãn không còn ký tự ASCII nào (emoji, thuần CJK); giữ cố định để ô màu xem
   * trước không nhảy mỗi lần gõ.
   */
  const [slugNow] = useState(() => Date.now());

  const trimmed = raw.trim();
  // Cùng hàm slug + cùng hàm chống trùng id mà server dùng, chạy trên đúng tập id
  // client đang giữ (đã gồm cả danh mục ẩn) → màu xem trước chính là màu của
  // danh mục sau khi tạo.
  const previewId = trimmed ? uniqueCategoryId(slugCategoryId(trimmed, slugNow), categories.map((c) => c.id)) : null;
  const created = createdLabel
    ? categories.find((c) => labelConflict(c.label, [createdLabel]))
    : undefined;
  const message = localError ?? (refused ? mutationError : null);

  function finish() {
    if (created) onCreated?.(created.id);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = normalizeCategoryLabel(raw);
    if (!label) {
      setLocalError(INVALID_LABEL);
      return;
    }
    if (labelConflict(label, categories.map((c) => c.label))) {
      setLocalError(DUPLICATE_LABEL);
      return;
    }
    setLocalError(null);
    setRefused(false);
    setBusy(true);
    const ok = await addCategory({ label, fixed, jarId });
    setBusy(false);
    if (!ok) {
      // Lý do (409 trùng tên / 422 / lỗi mạng) nằm ở `mutationError`; giữ nguyên
      // chữ người dùng đã gõ để họ sửa chứ không phải gõ lại.
      setRefused(true);
      return;
    }
    // Tạo từ trong hũ: hàng đã tick sẵn ở picker phía sau, đóng luôn. Tạo không
    // kèm hũ: phải nói rõ danh mục đã rơi vào đâu trước khi đóng.
    if (jarId) onClose();
    else setCreatedLabel(label);
  }

  if (createdLabel) {
    return (
      <Sheet title="Đã tạo danh mục" description={createdLabel} onClose={finish}>
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-row bg-surface-muted px-3 py-2.5 text-sm text-text">
            Danh mục đang ở “{KHAC_JAR_LABEL}” — bạn có thể xếp vào một hũ trong Cài đặt.
          </p>
          <button
            type="button"
            onClick={finish}
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Xong
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Thêm danh mục"
      description={jarLabel ? `Danh mục mới sẽ nằm trong hũ “${jarLabel}”` : `Danh mục mới sẽ ở “${KHAC_JAR_LABEL}” cho tới khi bạn xếp vào một hũ`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Tên danh mục</span>
          <span className="flex items-center gap-2.5 rounded-row border border-border bg-surface px-3">
            <span
              data-testid="category-hue-preview"
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: previewId ? categoryColor(previewId) : CATEGORY_COLOR_FALLBACK }}
            />
            <input
              autoFocus
              value={raw}
              maxLength={MAX_CATEGORY_LABEL}
              onChange={(e) => {
                setRaw(e.target.value);
                setLocalError(null);
                setRefused(false);
              }}
              aria-label="Tên danh mục"
              placeholder="Ví dụ: Học phí"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-text focus-visible:outline-none"
            />
          </span>
          {message && (
            <p role="alert" className="text-xs text-negative">
              {message}
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 rounded-row bg-surface-muted px-3 py-2.5">
          <input
            type="checkbox"
            checked={fixed}
            onChange={(e) => setFixed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">Chi cố định hằng tháng</span>
            <span className="block text-[11px] leading-relaxed text-muted">
              Tiền nhà, hoá đơn, bảo hiểm… — khoản gần như không đổi mỗi tháng.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={trimmed === "" || busy}
          className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {busy ? "Đang tạo…" : "Tạo danh mục"}
        </button>
      </form>
    </Sheet>
  );
}
