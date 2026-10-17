"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { isDuplicateLabel } from "@/domain/engine";
import { useCategories } from "@/state/categories";
import { useJarConfig } from "@/state/jars";
import type { CurrentJarFunds } from "@/state/use-current-jar-funds";
import { Sheet } from "@/components/primitives";
import { JAR_COLOR_OPTIONS, jarAccent } from "@/lib/category-colors";
import { cn } from "@/lib/cn";
import { JAR_ICON_KEYS, jarIcon } from "./jar-visuals";
import { HuCategoryPicker } from "./HuCategoryPicker";
import { nextCategoryPatch } from "./hu-category-patch";
import { HuLimitField } from "./HuLimitField";
import { HuBalanceField } from "./HuBalanceField";
import { HuDeleteSection } from "./HuDeleteSection";
import { JarMutationErrorNotice } from "./JarMutationErrorNotice";

/**
 * Trình sửa một hũ (mô hình ngân sách): tên, hạn mức chi mỗi tháng (`HuLimitField`),
 * số dư — nạp/rút (`HuBalanceField`, tách khỏi hạn mức, plan 260923), màu,
 * icon, danh mục trong hũ (`HuCategoryPicker` — chọn/bỏ chọn là bản nháp, lưu
 * MỘT lần khi đóng; tối đa một hũ), và xoá hũ (`HuDeleteSection`). Mọi thay đổi ghi qua `useJarConfig`
 * — state (theo phản hồi server) là nguồn sự thật; lần ghi bị từ chối hiện ở
 * `JarMutationErrorNotice`.
 */
export function HuEditorSheet({
  jarId,
  funds,
  onClose,
}: {
  jarId: string;
  /** Current-month balances + "Chờ phân bổ" (`useCurrentJarFunds`), owned by the tab. */
  funds: CurrentJarFunds;
  onClose: () => void;
}) {
  const { config, updateJar } = useJarConfig();
  // Mẫu số của nhãn "(n/total)" là số danh mục chi ĐANG DÙNG của persona — người
  // dùng thêm/ẩn danh mục thì tổng này đổi theo, không phải hằng số 10 preset.
  const { assignable } = useCategories();
  const jar = config.jars.find((j) => j.id === jarId);
  // Danh mục là bản NHÁP tới khi đóng: chạm trong `HuCategoryPicker` chỉ đổi state
  // này (chưa ghi gì), và `close` lưu MỘT lần nếu tập thật sự khác tập đã lưu — nên
  // chọn một danh mục đang ở hũ khác rồi bỏ chọn lại không làm nó rơi về "Chưa xếp
  // hũ". Các trường khác (tên, hạn mức, màu, icon, số dư) vẫn ghi ngay như cũ.
  const [pendingCategories, setPendingCategories] = useState<string[] | null>(null);
  const [closing, setClosing] = useState(false);

  if (!jar) return null;

  const selectedCategories = pendingCategories ?? jar.categoryIds;
  const categoriesChanged =
    pendingCategories !== null &&
    (pendingCategories.length !== jar.categoryIds.length || pendingCategories.some((id) => !jar.categoryIds.includes(id)));

  /** Lưu danh mục (nếu đổi) rồi đóng. Bị từ chối → ở lại, lý do hiện ở `JarMutationErrorNotice`. */
  async function close() {
    if (closing) return;
    if (categoriesChanged && pendingCategories) {
      setClosing(true);
      const ok = await updateJar(jarId, nextCategoryPatch(jar!, pendingCategories));
      setClosing(false);
      if (!ok) return;
    }
    onClose();
  }

  const dup = isDuplicateLabel(jar.label, config.jars, jarId);

  return (
    <Sheet title="Sửa hũ" description={jar.label} onClose={() => void close()}>
      <div className="flex flex-col gap-5">
        <JarMutationErrorNotice />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Tên hũ</span>
          <input
            defaultValue={jar.label}
            onBlur={(e) => {
              const el = e.currentTarget;
              const v = el.value.trim();
              if (!v || v === jar.label) return;
              // A refused rename snaps the field back to the stored name (U20).
              void updateJar(jarId, { label: v }).then((ok) => {
                if (!ok) el.value = jar.label;
              });
            }}
            aria-label="Tên hũ"
            className="min-h-11 rounded-row border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          {dup && <span className="text-xs text-warning">⚠ Trùng tên với hũ khác</span>}
        </label>

        <HuLimitField jar={jar} />

        <HuBalanceField jar={jar} funds={funds} />

        <Field label="Màu">
          <div className="flex flex-wrap gap-2">
            {JAR_COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Màu ${c}`}
                aria-pressed={jarAccent(jar) === c}
                onClick={() => updateJar(jarId, { color: c })}
                className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                style={{ background: c }}
              >
                {jarAccent(jar) === c && <Check size={16} className="text-primary-fg" aria-hidden />}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Biểu tượng">
          <div className="flex flex-wrap gap-2">
            {JAR_ICON_KEYS.map((key) => {
              const Icon = jarIcon(key);
              const active = (jar.icon ?? "wallet") === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Icon ${key}`}
                  aria-pressed={active}
                  onClick={() => updateJar(jarId, { icon: key })}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted",
                  )}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={`Danh mục trong hũ (${selectedCategories.length}/${assignable.length})`}>
          <HuCategoryPicker
            jar={jar}
            jars={config.jars}
            selected={selectedCategories}
            onChange={setPendingCategories}
          />
        </Field>

        {/* Xoá hũ bỏ luôn bản nháp danh mục — không lưu gì trước khi đóng. */}
        <HuDeleteSection jar={jar} jars={config.jars} onDeleted={onClose} />
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text">{label}</span>
      {children}
    </div>
  );
}
