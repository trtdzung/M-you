"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Jar, JarAllocation } from "@/domain/models";
import { validateJarInput } from "@/domain/engine";
import { cn } from "@/lib/cn";

const INPUT = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text";

/**
 * Edit one jar: label, allocation mode (% of the current balance / fixed VND),
 * and its value. The value field is validated through `validateJarInput` (M8)
 * and an invalid entry is BLOCKED from committing, so a NaN/negative can never
 * reach the engine. The live meter reconciles the total against the balance and
 * warns on over-allocation. Delete removes the jar.
 */
export function JarEditor({
  jar,
  accent,
  onLabel,
  onAllocation,
  onDelete,
}: {
  jar: Jar;
  accent: string;
  onLabel: (label: string) => void;
  onAllocation: (allocation: JarAllocation) => void;
  onDelete: () => void;
}) {
  const { mode } = jar.allocation;
  const [draft, setDraft] = useState(String(jar.allocation.value));
  const [error, setError] = useState<string | null>(null);

  function commit(raw: string) {
    const res = validateJarInput(raw, mode);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    onAllocation({ mode, value: res.value as number });
  }

  // Switching unit must NOT reinterpret the old figure under the new unit (80%
  // is not 80₫). Reset the value to 0 and let the user re-enter in the new unit.
  function switchMode(nextMode: JarAllocation["mode"]) {
    if (nextMode === mode) return;
    setDraft("0");
    setError(null);
    onAllocation({ mode: nextMode, value: 0 });
  }

  return (
    <div className="rounded-2xl bg-surface-muted/40 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent)} aria-hidden />
        <input
          value={jar.label}
          onChange={(e) => onLabel(e.target.value)}
          aria-label="Tên hũ"
          className={cn(INPUT, "flex-1 font-medium")}
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Xóa hũ ${jar.label}`}
          className="shrink-0 rounded-full p-2 text-muted hover:text-negative"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="inline-flex rounded-full bg-surface p-0.5 text-xs">
          {(["percent", "amount"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "rounded-full px-3 py-1 font-medium",
                mode === m ? "bg-primary text-primary-fg" : "text-muted",
              )}
            >
              {m === "percent" ? "%" : "VND"}
            </button>
          ))}
        </div>
        <input
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => e.key === "Enter" && commit(draft)}
          aria-label={`Phân bổ ${jar.label}`}
          className={cn(INPUT, "flex-1", error && "border-negative")}
        />
      </div>
      {error && <p className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  );
}
