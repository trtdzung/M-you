"use client";

import { useEffect, useRef, useState } from "react";
import type { Jar } from "@/domain/models";
import { useJarConfig } from "@/state/jars";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { parseVndInput } from "./parse-vnd-input";

const toDraft = (limit: number | undefined) => (limit != null ? String(limit) : "");

/**
 * "Hạn mức chi mỗi tháng" of one jar — the monthly PLAN, not money (plan 260923):
 * it resets each month and is never checked against CASA (only deposits are; see
 * `HuBalanceField`). Blank = chưa đặt (cleared, never 0 — invariant #6). Input
 * goes through the strict `parseVndInput` (U19); an unchanged value sends nothing
 * (U24). A refused write snaps the field back to the persisted value (the reason
 * shows in the sheet's error notice).
 */
export function HuLimitField({ jar }: { jar: Jar }) {
  const { updateJar } = useJarConfig();
  const persisted = jar.budgetLimit ?? undefined;
  const persistedRef = useRef(persisted);
  const [draft, setDraft] = useState(toDraft(persisted));
  const [error, setError] = useState<string | null>(null);

  // Follow the stored value when it changes underneath (a write landed / was healed).
  useEffect(() => {
    persistedRef.current = persisted;
    setDraft(toDraft(persisted));
    setError(null);
  }, [persisted]);

  const parsed = parseVndInput(draft);

  function commit() {
    if (parsed.kind === "error") {
      setError(parsed.message);
      return;
    }
    const next = parsed.kind === "ok" ? parsed.value : undefined;
    setError(null);
    if (next === persisted) {
      setDraft(toDraft(persisted)); // normalize "5.000.000" → stored form, no request
      return;
    }
    void updateJar(jar.id, { budgetLimit: next }).then((ok) => {
      if (!ok) setDraft(toDraft(persistedRef.current));
    });
  }

  const hint =
    error ??
    (parsed.kind === "empty"
      ? "Để trống = chưa đặt hạn mức"
      : parsed.kind === "ok"
        ? formatVnd(parsed.value)
        : parsed.message);
  const isError = error != null || parsed.kind === "error";

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-text">Hạn mức chi mỗi tháng</span>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        placeholder="Chưa đặt"
        aria-label="Hạn mức mỗi tháng"
        aria-invalid={isError}
        className="min-h-11 rounded-row border border-border bg-surface px-3 text-right text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      />
      <span className={cn("text-right text-xs", isError ? "text-negative" : "text-muted")}>{hint}</span>
    </label>
  );
}
