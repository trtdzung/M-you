"use client";

import type { SavingsGoalView } from "../../model/types";
import { LedgerPreview } from "./LedgerPreview";
import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { GOALS_COPY } from "../copy";
import { MoneyField } from "../form/fields/MoneyField";
import { errorBox, primaryButton } from "../styles";
import { parseAmount } from "./parse-amount";

export function ContributeSheet({
  goal,
  pending,
  error,
  formError,
  onSubmit,
  onClose,
  open = true,
}: {
  goal?: SavingsGoalView;
  pending: boolean;
  /** Server error for the amount field. */
  error?: string;
  /** Server failure not tied to a field ("" = default message). */
  formError?: string | null;
  onSubmit: (amount: number) => void;
  onClose: () => void;
  open?: boolean;
}) {
  const [raw, setRaw] = useState("");
  const { value, error: parseError } = parseAmount(raw);
  const c = GOALS_COPY.ledger;
  return (
    <Sheet open={open} title={c.contributeTitle} onClose={onClose} className="flex h-[85%] max-h-[85%] flex-col overflow-hidden [&>div:first-child]:shrink-0">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="flex flex-col gap-5 pb-44">
        {goal && <LedgerPreview goal={goal} amount={value ?? 0} kind="deposit" />}
        <div className="min-h-28"><MoneyField label={c.amount} value={raw} onChange={setRaw} error={parseError ?? error} /></div>
        {formError != null && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {formError || GOALS_COPY.actionError}
          </p>
        )}
      </div>
      </div>
      <div className="shrink-0 border-t border-border/60 pt-3">
        <button
          type="button"
          disabled={pending || value === undefined}
          onClick={() => value !== undefined && onSubmit(value)}
          className={`${primaryButton} w-full`}
        >
          {pending ? "Đang ghi nhận…" : c.submitDeposit}
        </button>
      </div>
    </Sheet>
  );
}
