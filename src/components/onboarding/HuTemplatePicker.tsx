"use client";

import { Check } from "lucide-react";
import { JAR_TEMPLATE_LIST, type JarTemplate } from "@/domain/models/jar-defaults";
import { cn } from "@/lib/cn";

/**
 * Radio list of the three seed jar sets (Cá nhân 6 / Gia đình 4 / Kinh doanh 3),
 * each showing its jar chips + count. Pure presentation — the parent owns the
 * selection and seeds the config via `applyTemplate` on confirm. Reuses
 * `JAR_TEMPLATE_LIST` (DRY) so the picker never drifts from the real templates.
 */
export function HuTemplatePicker({
  selectedId,
  onSelect,
}: {
  selectedId: JarTemplate["id"];
  onSelect: (id: JarTemplate["id"]) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Bộ hũ mẫu" className="flex flex-col gap-3">
      {JAR_TEMPLATE_LIST.map((template) => {
        const selected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(template.id)}
            className={cn(
              "shadow-card flex flex-col gap-2 rounded-2xl border-2 bg-surface p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              selected ? "border-primary" : "border-transparent hover:border-border",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text">{template.label}</span>
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-primary text-primary-fg" : "bg-surface-muted text-muted",
                )}
                aria-hidden
              >
                {selected && <Check size={14} strokeWidth={2.5} />}
              </span>
            </span>
            <span className="text-xs text-muted">{template.description}</span>
            <span className="flex flex-wrap gap-1.5">
              {template.jars.map((jar) => (
                <span
                  key={jar.id}
                  className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-text"
                >
                  {jar.label}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
