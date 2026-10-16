"use client";

import { useEffect, useRef, useState } from "react";
import type { Jar } from "@/domain/models";
import { fitsCasaCap } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { useCasaPool } from "@/state/use-casa-pool";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { parseVndInput } from "./parse-vnd-input";

const toDraft = (limit: number | undefined) => (limit != null ? String(limit) : "");

/**
 * "Hạn mức/tháng" of one jar. Blank = chưa đặt (cleared, never 0 — invariant
 * #6). Input goes through the strict `parseVndInput` (U19); an unchanged value
 * sends nothing (U24); the CASA-cap preview uses the SAME rule as the server —
 * only a RAISE that lands above CASA is blocked, lowering/clearing/re-saving
 * always passes even when Σ is already over the live balance (U9). A refused
 * write snaps the field back to the persisted value (the reason shows in the
 * sheet's error notice).
 */
export function HuLimitField({ jar, jars }: { jar: Jar; jars: Jar[] }) {
  const { updateJar } = useJarConfig();
  const casaPool = useCasaPool();
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
    if (next !== undefined) {
      const cap = fitsCasaCap(jars, casaPool, { [jar.id]: next });
      if (!cap.ok) {
        setError(
          cap.overBy == null
            ? "Chưa có số dư tài khoản để tăng hạn mức."
            : `Vượt số dư tài khoản ${formatVnd(cap.overBy)}. Nhập hạn mức thấp hơn.`,
        );
        return;
      }
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
      <span className="text-sm font-medium text-text">Hạn mức/tháng</span>
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
