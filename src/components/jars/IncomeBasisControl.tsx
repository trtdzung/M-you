"use client";

import { useState } from "react";
import type { JarConfig } from "@/domain/models";
import { validateJarInput } from "@/domain/engine";
import { Money, SourceBadge, type Source } from "@/components/primitives";
import { cn } from "@/lib/cn";

const INPUT = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text";

/**
 * Income-basis control for percent allocations. "Tự động" defers to the engine's
 * resolution (detected salary → unknown) and shows the resolved value + source
 * (F5). "Thủ công" lets the user type a VND figure — validated through
 * `validateJarInput` so a blank/negative never reaches the config.
 */
export function IncomeBasisControl({
  config,
  resolved,
  onSet,
}: {
  config: JarConfig;
  resolved: { value: number | "unknown"; source: Source };
  onSet: (basis: "auto" | number) => void;
}) {
  const isManual = typeof config.incomeBasis === "number";
  // Local UI mode so selecting "Thủ công" reveals the field WITHOUT persisting a
  // value yet — the app must never fabricate a ₫0 income before the user types.
  const [manual, setManual] = useState(isManual);
  const [draft, setDraft] = useState(isManual ? String(config.incomeBasis) : "");
  const [error, setError] = useState<string | null>(null);

  function chooseAuto() {
    setManual(false);
    setError(null);
    onSet("auto");
  }

  function commitManual(raw: string) {
    const res = validateJarInput(raw, "amount");
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    onSet(res.value as number);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit rounded-full bg-surface-muted p-0.5 text-xs">
        <button
          type="button"
          onClick={chooseAuto}
          className={cn("rounded-full px-3 py-1 font-medium", !manual ? "bg-primary text-primary-fg" : "text-muted")}
        >
          Tự động
        </button>
        <button
          type="button"
          onClick={() => setManual(true)}
          className={cn("rounded-full px-3 py-1 font-medium", manual ? "bg-primary text-primary-fg" : "text-muted")}
        >
          Thủ công
        </button>
      </div>

      {!manual ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          {resolved.value === "unknown" ? (
            "Chưa xác định thu nhập — chọn Thủ công để nhập."
          ) : (
            <>
              <Money amount={resolved.value} className="text-text" />
              <SourceBadge source={resolved.source} />
            </>
          )}
        </p>
      ) : (
        <>
          <input
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitManual(draft)}
            onKeyDown={(e) => e.key === "Enter" && commitManual(draft)}
            placeholder="Thu nhập tháng (VND)"
            aria-label="Thu nhập tháng"
            className={cn(INPUT, error && "border-negative")}
          />
          {error && <p className="text-xs text-negative">{error}</p>}
        </>
      )}
    </div>
  );
}
