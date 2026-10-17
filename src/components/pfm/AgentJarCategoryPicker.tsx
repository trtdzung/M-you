"use client";

import { cn } from "@/lib/cn";
import { categoryLabel, type JarConfig } from "@/domain/models";
import { KHAC_JAR_ID } from "@/domain/engine";

type Jar = JarConfig["jars"][number];

/**
 * Category model for an agent jar proposal. A category can live in only one jar:
 * one another jar holds is announced as moving here (edit), one taken OUT of this
 * jar is announced as going back to "Khác". A create only offers categories that
 * are still free (no owner, or only "Khác") — it never pulls one out of a jar.
 */
export function jarCategoryModel(input: {
  config: JarConfig;
  jar: Jar | undefined;
  isEdit: boolean;
  proposedIds: string[] | undefined;
  picked: string[] | null;
  assignable: { id: string; label: string }[];
  labels: ReadonlyMap<string, string>;
}) {
  const { config, jar, isEdit, proposedIds, picked, assignable, labels } = input;
  const currentIds = jar?.categoryIds ?? [];
  const ownerOf = (id: string) => config.jars.find((j) => j.id !== jar?.id && j.categoryIds.includes(id));
  const isFree = (id: string) => {
    const owner = ownerOf(id);
    return !owner || owner.id === KHAC_JAR_ID;
  };
  const proposed = proposedIds ?? currentIds;
  const selected = picked ?? (isEdit ? proposed : proposed.filter(isFree));
  const unavailable = isEdit ? [] : (proposedIds ?? []).filter((id) => !isFree(id));
  // Edit: every pickable category, plus any selected/current one no longer assignable
  // (archived) so it stays visible and can still be un-picked. Create: only free ones.
  const options = isEdit
    ? [
        ...assignable.map((c) => ({ id: c.id, label: c.label })),
        ...[...new Set([...selected, ...currentIds])]
          .filter((id) => !assignable.some((c) => c.id === id))
          .map((id) => ({ id, label: categoryLabel(id, labels) })),
      ]
    : assignable.filter((c) => isFree(c.id)).map((c) => ({ id: c.id, label: c.label }));
  const moving = selected.flatMap((id) => {
    const owner = ownerOf(id);
    return owner ? [`${categoryLabel(id, labels)} sẽ chuyển từ hũ ${owner.label}`] : [];
  });
  const unavailableNote = unavailable.map((id) => `${categoryLabel(id, labels)} đang thuộc hũ ${ownerOf(id)?.label ?? "khác"}`);
  const released = currentIds.filter((id) => !selected.includes(id)).map((id) => categoryLabel(id, labels));
  return { currentIds, selected, options, moving, unavailableNote, released };
}

export function AgentJarCategoryPicker({
  isEdit,
  disabled,
  model,
  onToggle,
}: {
  isEdit: boolean;
  disabled: boolean;
  model: ReturnType<typeof jarCategoryModel>;
  onToggle: (id: string) => void;
}) {
  const { options, selected, moving, unavailableNote, released } = model;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {isEdit ? "Danh mục (bấm để chọn / bỏ)" : "Danh mục chưa xếp hũ (bấm để chọn / bỏ)"}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(o.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
                on ? "bg-primary text-primary-fg" : "bg-surface-muted text-text",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {!isEdit && options.length === 0 && (
        <p className="text-[11px] text-muted">Chưa có danh mục nào chưa xếp hũ. Tạo hũ trước, rồi thêm danh mục ở bước sửa hũ.</p>
      )}
      {unavailableNote.length > 0 && (
        <p className="text-[11px] text-muted">{unavailableNote.join("; ")} nên không chọn được khi tạo hũ mới.</p>
      )}
      {moving.length > 0 && <p className="text-[11px] text-muted">{moving.join("; ")}.</p>}
      {isEdit && released.length > 0 && (
        <p className="text-[11px] text-muted">{released.join(", ")} bỏ khỏi hũ này sẽ thành “Chưa xếp hũ”.</p>
      )}
    </div>
  );
}
