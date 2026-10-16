"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import { CATEGORIES } from "@/domain/models";
import { categoryToJarMap, KHAC_JAR_ID, KHAC_JAR_LABEL } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { Sheet } from "@/components/primitives";
import { categoryColor } from "@/lib/category-colors";
import { JarMutationErrorNotice } from "./JarMutationErrorNotice";

/**
 * Quản lý danh mục chi tiêu. Mỗi danh mục thuộc đúng một hũ (exactly-one) — đổi
 * hũ ở đây gỡ khỏi hũ cũ tự động (`assignCategory`). Mọi danh mục hiện tại là
 * preset → khoá đổi tên/xoá (chấm khoá). Income đã bị loại — chỉ còn danh mục
 * chi tiêu. Tạo danh mục tuỳ chỉnh cần kho danh mục người dùng — để lại cho bản
 * sau (picker đã có sẵn seam `onAddCategory`).
 */
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { config, assignCategory } = useJarConfig();
  const catToJar = useMemo(() => categoryToJarMap(config), [config]);
  const jarLabel = (id: string) => (id === KHAC_JAR_ID ? KHAC_JAR_LABEL : config.jars.find((j) => j.id === id)?.label ?? id);

  const rows = CATEGORIES.filter((c) => c.kind === "expense");

  return (
    <Sheet title="Quản lý danh mục" description="Danh mục mặc định được khoá" onClose={onClose}>
      <div className="mb-3">
        <JarMutationErrorNotice />
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          const jarId = catToJar.get(c.id) ?? KHAC_JAR_ID;
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-row bg-surface-muted px-3 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.id) }} />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-text">{c.label}</span>
                <Lock size={11} className="shrink-0 text-muted" aria-label="Danh mục mặc định (khoá)" />
              </span>
              {/* Every row is an expense category (income was removed), so each
                  always maps to exactly one hũ via this select. */}
              <select
                aria-label={`Hũ của ${c.label}`}
                value={jarId}
                onChange={(e) => assignCategory(c.id, e.target.value)}
                className="min-h-9 max-w-[46%] rounded-sm border border-border bg-surface px-2 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {config.jars.map((j) => (
                  <option key={j.id} value={j.id}>{j.label}</option>
                ))}
                {/* Defensive: keep the current value selectable if a category
                    resolves to "Khác" but no "Khác" jar is materialized yet.
                    Unreachable in the normal flow — load-time healOrphanCategories
                    always creates a real "Khác" jar (exactly-one) before this
                    renders — but it guards against selecting a value the list
                    would otherwise drop. Do NOT rely on this to assign to "Khác":
                    assignCategory to a non-existent jar id would orphan the
                    category until the next heal. */}
                {jarId === KHAC_JAR_ID && !config.jars.some((j) => j.id === KHAC_JAR_ID) && (
                  <option value={KHAC_JAR_ID}>{jarLabel(KHAC_JAR_ID)}</option>
                )}
              </select>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-row bg-surface-muted px-3 py-2 text-xs text-muted">
        Thêm danh mục tuỳ chỉnh sẽ có trong bản cập nhật tới. Danh mục Chi luôn thuộc đúng một hũ.
      </p>
    </Sheet>
  );
}
