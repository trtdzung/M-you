"use client";

import { cn } from "@/lib/cn";
import { categoryLabel, type JarConfig } from "@/domain/models";

type Jar = JarConfig["jars"][number];

/**
 * Category model for an agent jar proposal (create AND edit). A category can live in
 * only one jar, so picking one another jar holds is allowed and announced as moving
 * here ("… sẽ chuyển từ hũ X" — the server takes it out of the old jar on save, in the
 * same write); one taken OUT of this jar (edit) is announced as becoming "Chưa xếp hũ".
 * Every pickable category is offered, plus any selected/current one no longer
 * assignable (archived) so it stays visible and can still be un-picked.
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
  const { config, jar, proposedIds, picked, assignable, labels } = input;
  const currentIds = jar?.categoryIds ?? [];
  const ownerOf = (id: string) => config.jars.find((j) => j.id !== jar?.id && j.categoryIds.includes(id));
  const selected = picked ?? proposedIds ?? currentIds;
  const options = [
    ...assignable.map((c) => ({ id: c.id, label: c.label })),
    ...[...new Set([...selected, ...currentIds])]
      .filter((id) => !assignable.some((c) => c.id === id))
      .map((id) => ({ id, label: categoryLabel(id, labels) })),
  ];
  const moving = selected.flatMap((id) => {
    const owner = ownerOf(id);
    return owner ? [`${categoryLabel(id, labels)} sẽ chuyển từ hũ ${owner.label}`] : [];
  });
  const released = currentIds.filter((id) => !selected.includes(id)).map((id) => categoryLabel(id, labels));
  return { currentIds, selected, options, moving, released };
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
  const { options, selected, moving, released } = model;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
        Danh mục (bấm để chọn / bỏ)
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
      {moving.length > 0 && <p className="text-[11px] text-muted">{moving.join("; ")}.</p>}
      {isEdit && released.length > 0 && (
        <p className="text-[11px] text-muted">{released.join(", ")} bỏ khỏi hũ này sẽ thành “Chưa xếp hũ”.</p>
      )}
    </div>
  );
}
