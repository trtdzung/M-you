"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StoredCategory } from "@/domain/models";
import { categoryToJarMap } from "@/domain/engine";
import { useCategories } from "@/state/categories";
import { useJarConfig } from "@/state/jars";
import { AddCategoryButton } from "@/components/common/AddCategoryButton";
import { CategoryTaxonomyNotice, taxonomyState } from "@/components/common/CategoryTaxonomyNotice";
import { Sheet } from "@/components/primitives";
import { CategoryCreateSheet } from "./CategoryCreateSheet";
import { CategoryDeleteSheet } from "./CategoryDeleteSheet";
import { ArchivedCategoryRow, CategoryRow, isCustomCategory } from "./CategoryRowActions";
import { CategoryMutationErrorNotice } from "./CategoryMutationErrorNotice";
import { JarMutationErrorNotice } from "./JarMutationErrorNotice";

/**
 * Quản lý danh mục chi tiêu. Hai mục có nhãn riêng — "Danh mục của bạn" (đổi
 * tên / ẩn / xoá được) và "Danh mục mặc định" (khoá) — vì một danh mục người dùng
 * tự nhập là DỮ LIỆU CỦA HỌ và không được trông như dữ liệu ngân hàng sinh ra
 * (bất biến #5). Danh sách lấy từ taxonomy đã lưu của persona (`useCategories`),
 * nên danh mục vừa tạo hiện ra ngay.
 *
 * Danh mục đã ẩn gom vào nhóm "Đã ẩn (k)" gập lại: chúng rời khỏi mọi bộ chọn
 * nhưng GIỮ nguyên hũ và nhãn, nên ẩn một danh mục không làm xê dịch bất kỳ con
 * số nào đã hiển thị (bất biến #6) — và luôn "Hiện lại" được.
 *
 * Mọi lượt ghi đi qua provider: taxonomy qua `useCategories`, đổi hũ qua
 * `useJarConfig().assignCategory` (bất biến #4). Sheet này không tự gọi
 * `/api/categories`.
 */
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { config } = useJarConfig();
  const { categories, assignable, loaded, error, retry } = useCategories();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<StoredCategory | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const catToJar = useMemo(() => categoryToJarMap(config), [config]);
  const custom = assignable.filter(isCustomCategory);
  const presets = assignable.filter((c) => !isCustomCategory(c));
  const hidden = categories.filter((c) => c.kind === "expense" && c.archived);
  const state = taxonomyState({ loaded, error }, assignable.length);

  const row = (c: StoredCategory) => (
    <CategoryRow
      key={c.id}
      category={c}
      jarId={catToJar.get(c.id) ?? null}
      jars={config.jars}
      onDelete={setDeleting}
    />
  );

  return (
    <Sheet title="Quản lý danh mục" description="Danh mục của bạn sửa được; danh mục mặc định thì khoá" onClose={onClose}>
      <div className="mb-3 flex flex-col gap-2">
        <JarMutationErrorNotice />
        <CategoryMutationErrorNotice />
      </div>

      <div className="mb-4">
        <AddCategoryButton onClick={() => setCreating(true)} />
      </div>

      {state !== "ready" ? (
        <CategoryTaxonomyNotice state={state} error={error} retry={retry} emptyLabel="Chưa có danh mục chi nào." />
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Danh mục của bạn</h3>
            {custom.length === 0 ? (
              <p className="rounded-row bg-surface-muted px-3 py-2.5 text-sm text-muted">
                Bạn chưa tạo danh mục nào.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">{custom.map(row)}</ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Danh mục mặc định</h3>
            <ul className="flex flex-col gap-2">{presets.map(row)}</ul>
          </section>

          {hidden.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                aria-expanded={showHidden}
                className="flex min-h-9 items-center gap-1 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {showHidden ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                Đã ẩn ({hidden.length})
              </button>
              {showHidden && (
                <ul className="flex flex-col gap-2">
                  {hidden.map((c) => (
                    <ArchivedCategoryRow key={c.id} category={c} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <p className="mt-4 rounded-row bg-surface-muted px-3 py-2 text-xs text-muted">
        Mỗi danh mục Chi luôn thuộc đúng một hũ. Danh mục đã ẩn vẫn giữ hũ và nhãn cũ, nên số liệu quá
        khứ không đổi.
      </p>

      {creating && <CategoryCreateSheet onClose={() => setCreating(false)} />}
      {deleting && <CategoryDeleteSheet category={deleting} onClose={() => setDeleting(null)} />}
    </Sheet>
  );
}
