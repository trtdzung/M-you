"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { GOALS_COPY } from "../copy";
import { MoneyField } from "../form/fields/MoneyField";
import { errorBox, primaryButton } from "../styles";
import { parseAmount } from "./parse-amount";

export function ContributeSheet({
  pending,
  error,
  formError,
  onSubmit,
  onClose,
}: {
  pending: boolean;
  /** Server error for the amount field. */
  error?: string;
  /** Server failure not tied to a field ("" = default message). */
  formError?: string | null;
  onSubmit: (amount: number) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const { value, error: parseError } = parseAmount(raw);
  const c = GOALS_COPY.ledger;
  return (
    <Sheet title={c.contributeTitle} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <MoneyField label={c.amount} value={raw} onChange={setRaw} error={parseError ?? error} />
        {formError != null && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {formError || GOALS_COPY.actionError}
          </p>
        )}
        <button
          type="button"
          disabled={pending || value === undefined}
          onClick={() => value !== undefined && onSubmit(value)}
          className={primaryButton}
        >
          {c.submitDeposit}
        </button>
      </div>
    </Sheet>
  );
}
