"use client";

import type { JarConfig } from "@/domain/models";
import { CATEGORIES } from "@/domain/models/categories";

const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense");
const SELECT =
  "rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text";

/**
 * Assign each expense category to exactly one jar (or leave it in the implicit
 * "Chưa phân hũ" bucket). Categories are rendered from the live taxonomy (#7),
 * never hard-coded. Reassignment is delegated to `onAssign`, which strips the
 * category from any prior jar so it can never live in two jars at once.
 */
export function CategoryAssigner({
  config,
  onAssign,
}: {
  config: JarConfig;
  onAssign: (categoryId: string, jarId: string | null) => void;
}) {
  const jarOf = (catId: string) =>
    config.jars.find((j) => j.categoryIds.includes(catId))?.id ?? "";

  return (
    <ul className="flex flex-col gap-2">
      {EXPENSE_CATEGORIES.map((cat) => (
        <li key={cat.id} className="flex items-center justify-between gap-2">
          <span className="text-sm text-text">{cat.label}</span>
          <select
            value={jarOf(cat.id)}
            onChange={(e) => onAssign(cat.id, e.target.value || null)}
            aria-label={`Hũ cho ${cat.label}`}
            className={SELECT}
          >
            <option value="">Chưa phân</option>
            {config.jars.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
