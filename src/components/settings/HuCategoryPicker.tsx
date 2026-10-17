"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { type Jar } from "@/domain/models";
import { categoryToJarMap, KHAC_JAR_LABEL } from "@/domain/engine";
import { CategoryTaxonomyNotice, taxonomyState } from "@/components/common/CategoryTaxonomyNotice";
import { useCategories } from "@/state/categories";
import { categoryColor } from "@/lib/category-colors";
import { cn } from "@/lib/cn";
import { toggleCategoryId } from "./hu-category-patch";

/**
 * Bộ chọn danh mục của MỘT hũ. Liệt kê mọi danh mục chi (không chỉ những danh mục
 * đã thuộc hũ này), đánh dấu ✓ các danh mục hũ đang giữ, và với danh mục đang
 * thuộc hũ khác thì hiện nhãn "đang ở <hũ>" — người dùng thấy ngay mình đang lấy
 * danh mục từ đâu về.
 *
 * Trước đây trình sửa hũ chỉ CHUYỂN ĐI được danh mục sẵn có; muốn THÊM phải thoát
 * ra màn "Quản lý danh mục" rồi đổi từng dropdown. Picker này gộp cả hai chiều vào
 * một chạm.
 *
 * Một danh mục thuộc TỐI ĐA một hũ: bỏ chọn = danh mục thành "Chưa xếp hũ" (không
 * hũ nào giữ), chi tiêu cũ của nó vẫn được tính trong báo cáo dưới nhóm đó.
 *
 * KHÔNG ghi gì khi chạm: picker chỉ đổi bản nháp (`selected`/`onChange` do
 * `HuEditorSheet` giữ) và trình sửa lưu MỘT lần khi đóng, bằng
 * `PATCH /api/jars/:id` với trọn tập `categoryIds` — `stripCategories` gỡ danh mục
 * khỏi hũ cũ trong cùng lượt ghi đó. Chọn một danh mục đang ở hũ khác rồi bỏ chọn
 * lại (trước khi đóng) không đổi gì cả: hũ kia vẫn giữ nó.
 */

/** Bỏ dấu + thường hoá để tìm "an uong" ra "Ăn uống". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

export function HuCategoryPicker({
  jar,
  jars,
  selected,
  onChange,
}: {
  jar: Jar;
  /** Toàn bộ hũ của persona — để tra "danh mục này đang ở hũ nào". */
  jars: Jar[];
  /**
   * Tập danh mục ĐANG CHỌN (bản nháp của trình sửa, chưa ghi). Chạm chỉ đổi bản
   * nháp qua `onChange` — không ghi gì lên server; trình sửa lưu một lần khi đóng.
   * Nhờ vậy chọn một danh mục đang ở hũ khác rồi bỏ chọn lại thì hũ kia vẫn giữ nó.
   */
  selected: string[];
  onChange: (categoryIds: string[]) => void;
}) {
  // Danh sách danh mục chi ĐANG DÙNG của persona (không lấy hằng số đóng gói):
  // danh mục người dùng tự tạo phải xếp hũ được ngay, còn danh mục đã ẩn thì
  // không được gán thêm — nó vẫn giữ hũ cũ nên số liệu quá khứ không đổi.
  const { assignable, loaded, error, retry } = useCategories();
  const [query, setQuery] = useState("");

  const ownerOf = useMemo(() => categoryToJarMap({ version: 3, jars }), [jars]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const rows = useMemo(() => {
    const q = fold(query.trim());
    return q ? assignable.filter((c) => fold(c.label).includes(q)) : assignable;
  }, [query, assignable]);

  // Trạng thái đo trên TOÀN tập, không đo trên `rows`: `rows` rỗng vì từ khoá tìm
  // kiếm là chuyện khác hẳn với "chưa có danh mục nào" (đã có câu riêng bên dưới).
  const state = taxonomyState({ loaded, error }, assignable.length);

  // Hũ đang giữ danh mục theo cấu hình ĐÃ LƯU; không hũ nào → "Chưa xếp hũ".
  const savedOwnerLabel = (categoryId: string) => {
    const ownerId = ownerOf.get(categoryId);
    return (ownerId && jars.find((j) => j.id === ownerId)?.label) || KHAC_JAR_LABEL;
  };
  // Nhãn của hàng CHƯA chọn: hũ khác đang giữ nó thì "đang ở <hũ>"; nếu nó đang
  // thuộc CHÍNH hũ này (đã bỏ chọn, chờ lưu) thì sẽ là "Chưa xếp hũ".
  const unselectedLabel = (categoryId: string) =>
    ownerOf.get(categoryId) === jar.id ? KHAC_JAR_LABEL : savedOwnerLabel(categoryId);
  // Nhãn của hàng ĐÃ chọn mà đang được lấy từ hũ khác (chuyển khi lưu).
  const takenFrom = (categoryId: string): string | null => {
    const ownerId = ownerOf.get(categoryId);
    return ownerId && ownerId !== jar.id ? savedOwnerLabel(categoryId) : null;
  };

  function toggle(categoryId: string) {
    onChange(toggleCategoryId(selected, categoryId));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm danh mục"
          placeholder="Tìm danh mục…"
          className="min-h-11 w-full rounded-row border border-border bg-surface pl-8 pr-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
      </div>

      {state !== "ready" ? (
        <CategoryTaxonomyNotice
          state={state}
          error={error}
          retry={retry}
          emptyLabel="Chưa có danh mục chi nào để xếp hũ."
        />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Không có danh mục nào khớp “{query.trim()}”.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((c) => {
            const inJar = selectedSet.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={inJar}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-row border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    inJar ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-surface-muted",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: categoryColor(c.id) }}
                  />
                  <span className={cn("min-w-0 flex-1 truncate text-sm text-text", inJar && "font-medium")}>
                    {c.label}
                  </span>
                  {!inJar && (
                    <span className="shrink-0 truncate text-[11px] text-muted">
                      đang ở {unselectedLabel(c.id)}
                    </span>
                  )}
                  {inJar && takenFrom(c.id) && (
                    <span className="shrink-0 truncate text-[11px] text-muted">
                      lấy từ {takenFrom(c.id)}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                      inJar ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface",
                    )}
                  >
                    {inJar && <Check size={13} strokeWidth={2.5} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        Mỗi danh mục thuộc tối đa một hũ — bỏ chọn sẽ thành “{KHAC_JAR_LABEL}” (chi tiêu vẫn được tính, chỉ chưa thuộc hũ nào). Thay đổi danh mục chỉ được lưu khi bạn bấm Đóng.
      </p>
    </div>
  );
}
