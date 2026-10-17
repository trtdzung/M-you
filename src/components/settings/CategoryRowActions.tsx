"use client";

import { Eye, EyeOff, Lock, Trash2 } from "lucide-react";
import type { Jar, StoredCategory } from "@/domain/models";
import { CUSTOM_CATEGORY_PREFIX, MAX_CATEGORY_LABEL } from "@/domain/models/category-rules";
import { KHAC_JAR_LABEL } from "@/domain/engine";
import { useCategories } from "@/state/categories";
import { useJarConfig } from "@/state/jars";
import { categoryColor } from "@/lib/category-colors";

/**
 * Một hàng trong "Quản lý danh mục", cùng các hành động của nó.
 *
 * Server không trả cờ `custom` ra ngoài (đó là chuyện của cửa ghi), nên client
 * phân biệt bằng tiền tố `c_` — thứ mà `slugCategoryId` gắn vào MỌI id người dùng
 * tạo và `isReservedCategoryId` bảo đảm không preset nào mang được. Danh mục
 * mặc định vì thế chỉ có ổ khoá và ô chọn hũ: đổi tên/ẩn/xoá đều bị server từ
 * chối 403, nên không bày nút để người dùng đâm vào tường.
 *
 * Provenance (bất biến #5): hàng của người dùng và hàng của hệ thống nằm ở hai
 * mục có nhãn riêng bên `CategoryManager`; ổ khoá ở đây là dấu hiệu thứ hai, để
 * dữ liệu người dùng tự nhập không trông như dữ liệu do ngân hàng sinh ra.
 */

/** Danh mục do người dùng tạo (id mang tiền tố `c_`) — hàng duy nhất có CRUD. */
export function isCustomCategory(category: StoredCategory): boolean {
  return category.id.startsWith(CUSTOM_CATEGORY_PREFIX);
}

const DOT = "h-2.5 w-2.5 shrink-0 rounded-full";
const ICON_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

export function CategoryRow({
  category,
  jarId,
  jars,
  onDelete,
}: {
  category: StoredCategory;
  /** Hũ đang giữ danh mục này (config đã heal khi tải, nên luôn có chủ). */
  /** The jar holding the category, or `null` = chưa xếp hũ. */
  jarId: string | null;
  jars: Jar[];
  onDelete: (category: StoredCategory) => void;
}) {
  const custom = isCustomCategory(category);
  return (
    <li className="flex flex-col gap-2 rounded-row bg-surface-muted px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={DOT} style={{ background: categoryColor(category.id) }} />
        {custom ? (
          <CategoryNameInput category={category} />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-text">{category.label}</span>
            <Lock size={11} className="shrink-0 text-muted" aria-label="Danh mục mặc định (khoá)" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <JarSelect category={category} jarId={jarId} jars={jars} />
        {custom && <CategoryRowActions category={category} onDelete={onDelete} />}
      </div>
    </li>
  );
}

/**
 * Đổi tên tại chỗ, ghi khi rời ô hoặc khi nhấn Enter (theo đúng nếp của ô "Tên
 * hũ" trong `HuEditorSheet`). Lượt ghi bị từ chối thì ô BẬT LẠI tên đã lưu — màn
 * hình không được giữ một cái tên server chưa nhận; lý do hiện ở
 * `CategoryMutationErrorNotice`. Id không đổi theo tên, nên màu của danh mục
 * đứng yên sau khi đổi tên.
 */
function CategoryNameInput({ category }: { category: StoredCategory }) {
  const { renameCategory } = useCategories();
  return (
    <input
      defaultValue={category.label}
      maxLength={MAX_CATEGORY_LABEL}
      aria-label={`Tên danh mục ${category.label}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        const next = el.value.trim();
        if (!next || next === category.label) {
          el.value = category.label;
          return;
        }
        void renameCategory(category.id, next).then((ok) => {
          if (!ok) el.value = category.label;
        });
      }}
      className="min-h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    />
  );
}

/** Ẩn và xoá — chỉ dựng cho hàng của người dùng. */
function CategoryRowActions({
  category,
  onDelete,
}: {
  category: StoredCategory;
  onDelete: (category: StoredCategory) => void;
}) {
  const { setArchived } = useCategories();
  return (
    <>
      <button
        type="button"
        onClick={() => void setArchived(category.id, true)}
        aria-label={`Ẩn danh mục ${category.label}`}
        className={ICON_BUTTON}
      >
        <EyeOff size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onDelete(category)}
        aria-label={`Xoá danh mục ${category.label}`}
        className={`${ICON_BUTTON} hover:text-negative`}
      >
        <Trash2 size={15} aria-hidden />
      </button>
    </>
  );
}

/**
 * Hàng trong nhóm "Đã ẩn": chỉ có nút hiện lại. Không có ô chọn hũ — danh mục ẩn
 * vẫn giữ nguyên hũ cũ (nên tổng chi của hũ trong quá khứ không xê dịch), và để
 * người dùng đổi hũ cho một danh mục họ không còn nhìn thấy ở đâu chỉ gây nhầm.
 */
export function ArchivedCategoryRow({ category }: { category: StoredCategory }) {
  const { setArchived } = useCategories();
  return (
    <li className="flex items-center gap-2 rounded-row bg-surface-muted px-3 py-2">
      <span className={DOT} style={{ background: categoryColor(category.id) }} />
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{category.label}</span>
      <button
        type="button"
        onClick={() => void setArchived(category.id, false)}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Eye size={13} aria-hidden /> Hiện lại
      </button>
    </li>
  );
}

/**
 * Mỗi danh mục chi thuộc TỐI ĐA một hũ, nên đổi hũ là một ô chọn: `assignCategory`
 * gỡ khỏi hũ cũ trong cùng lượt ghi. Danh mục chưa thuộc hũ nào (vd hũ của nó đã
 * bị xoá) hiện "Chưa xếp hũ" — chọn một hũ để xếp nó vào.
 */
function JarSelect({ category, jarId, jars }: { category: StoredCategory; jarId: string | null; jars: Jar[] }) {
  const { assignCategory } = useJarConfig();
  return (
    <select
      aria-label={`Hũ của ${category.label}`}
      value={jarId ?? ""}
      onChange={(e) => {
        if (e.target.value) void assignCategory(category.id, e.target.value);
      }}
      className="min-h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {jars.map((j) => (
        <option key={j.id} value={j.id}>
          {j.label}
        </option>
      ))}
      {jarId === null && (
        <option value="" disabled>
          {KHAC_JAR_LABEL}
        </option>
      )}
    </select>
  );
}
