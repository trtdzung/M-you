"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { type Jar } from "@/domain/models";
import { categoryToJarMap, KHAC_JAR_ID, KHAC_JAR_LABEL } from "@/domain/engine";
import { AddCategoryButton } from "@/components/common/AddCategoryButton";
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
 * Dưới bất biến exactly-one KHÔNG có trạng thái "không thuộc hũ nào": bỏ chọn =
 * trả danh mục về hũ catch-all "Khác". Việc đó do server tự làm —
 * `writeJarConfig` đọc lại qua `healOrphanCategories`, nên một danh mục bị gỡ
 * khỏi hũ sẽ được heal vào "Khác" (tạo mới nếu chưa có) trong cùng một lượt ghi.
 * Client không cần biết `KHAC_JAR_ID`. Vì vậy trong chính hũ "Khác" thì các ô đã
 * chọn bị khoá: bỏ chọn ở đó là chuyển về chính nó.
 *
 * MỘT cửa ghi cho cả thêm lẫn gỡ: `PATCH /api/jars/:id` với trọn tập
 * `categoryIds` mong muốn — `stripCategories` gỡ danh mục khỏi hũ cũ trong cùng
 * lượt ghi đó. (Batch `PATCH /api/jars` không dùng được: nó cố tình bỏ
 * `categoryIds`.)
 *
 * `draft` là bản phủ lạc quan và cũng là thứ chống đua đọc-sửa-ghi: hàng đợi
 * trong `useJarConfig` xếp thứ tự các REQUEST, nhưng không xếp thứ tự việc
 * component ĐỌC `jar.categoryIds` để dựng tập kế tiếp. Hai cú chạm nhanh cùng
 * đọc trạng thái trước cú thứ nhất thì cú thứ hai sẽ huỷ cú thứ nhất. Nên mỗi cú
 * chạm phải dẫn xuất từ `draft` chứ không phải từ config của server.
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
  onCommit,
  onAddCategory,
}: {
  jar: Jar;
  /** Toàn bộ hũ của persona — để tra "danh mục này đang ở hũ nào". */
  jars: Jar[];
  /**
   * Ghi tập `categoryIds` mong muốn của hũ. Resolve `true` khi server nhận,
   * `false` khi bị từ chối (lý do đã hiện ở `JarMutationErrorNotice`).
   */
  onCommit: (categoryIds: string[]) => Promise<boolean>;
  /**
   * Mở trình tạo danh mục mới cho CHÍNH hũ này (`HuEditorSheet` truyền `jarId`
   * xuống `CategoryCreateSheet`, nên danh mục vào thẳng hũ đang mở trong MỘT
   * lượt ghi — không tạo vào "Khác" rồi chuyển). Bỏ trống thì nút ẩn đi.
   */
  onAddCategory?: () => void;
}) {
  // Danh sách danh mục chi ĐANG DÙNG của persona (không lấy hằng số đóng gói):
  // danh mục người dùng tự tạo phải xếp hũ được ngay, còn danh mục đã ẩn thì
  // không được gán thêm — nó vẫn giữ hũ cũ nên số liệu quá khứ không đổi.
  const { assignable, loaded, error, retry } = useCategories();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  /** Chỉ cú chạm MỚI NHẤT được phép gỡ bản phủ lạc quan. */
  const seqRef = useRef(0);

  const ownerOf = useMemo(() => categoryToJarMap({ version: 3, jars }), [jars]);
  const isKhac = jar.id === KHAC_JAR_ID;

  const selected = draft ?? jar.categoryIds;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const rows = useMemo(() => {
    const q = fold(query.trim());
    return q ? assignable.filter((c) => fold(c.label).includes(q)) : assignable;
  }, [query, assignable]);

  // Trạng thái đo trên TOÀN tập, không đo trên `rows`: `rows` rỗng vì từ khoá tìm
  // kiếm là chuyện khác hẳn với "chưa có danh mục nào" (đã có câu riêng bên dưới).
  const state = taxonomyState({ loaded, error }, assignable.length);

  // Config đã heal khi tải nên mọi danh mục chi đều có chủ; fallback "Khác" chỉ
  // phòng khi một lượt ghi vừa gỡ danh mục và UI render trước phản hồi.
  const ownerLabel = (categoryId: string) => {
    const ownerId = ownerOf.get(categoryId) ?? KHAC_JAR_ID;
    if (ownerId === KHAC_JAR_ID) return KHAC_JAR_LABEL;
    return jars.find((j) => j.id === ownerId)?.label ?? KHAC_JAR_LABEL;
  };

  function toggle(categoryId: string) {
    const next = toggleCategoryId(selected, categoryId);
    const mine = (seqRef.current += 1);
    setDraft(next);
    // Ghi hỏng → gỡ bản phủ, hàng bật về trạng thái đã lưu, lý do hiện ở notice.
    void onCommit(next).finally(() => {
      if (seqRef.current === mine) setDraft(null);
    });
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
            const locked = inJar && isKhac;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={inJar}
                  disabled={locked}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-row border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    inJar ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-surface-muted",
                    locked && "cursor-default opacity-70 hover:bg-surface",
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
                      đang ở {ownerLabel(c.id)}
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

      {onAddCategory && <AddCategoryButton onClick={onAddCategory} />}

      <p className="text-[11px] leading-relaxed text-muted">
        {isKhac
          ? `Mỗi danh mục luôn thuộc đúng một hũ. Danh mục ở “${KHAC_JAR_LABEL}” là những danh mục chưa được xếp hũ — mở hũ đích rồi chọn nó ở đó.`
          : `Mỗi danh mục luôn thuộc đúng một hũ — bỏ chọn sẽ chuyển về “${KHAC_JAR_LABEL}”.`}
      </p>
    </div>
  );
}
