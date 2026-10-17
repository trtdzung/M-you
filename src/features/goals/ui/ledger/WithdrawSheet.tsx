"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { GOALS_COPY } from "../copy";
import { MoneyField } from "../form/fields/MoneyField";
import { errorBox, primaryButton } from "../styles";
import { CommitmentPhraseInput, phraseMatches } from "./CommitmentPhraseInput";
import { parseAmount } from "./parse-amount";
import { WithdrawTradeoffNotice } from "./WithdrawTradeoffNotice";

export function WithdrawSheet({
  goalName,
  currentAmount,
  monthlyPace,
  pending,
  error,
  formError,
  onSubmit,
  onClose,
}: {
  goalName: string;
  currentAmount: number;
  monthlyPace: number | null;
  pending: boolean;
  error?: string;
  formError?: string | null;
  onSubmit: (entry: { amount: number; note: string }) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [typed, setTyped] = useState("");
  const { value, error: parseError } = parseAmount(raw);
  const phrase = GOALS_COPY.commitmentPhrase(goalName);
  const tooMuch = value !== undefined && value > currentAmount;
  const valid = value !== undefined && !tooMuch;
  const canSubmit = valid && phraseMatches(typed, phrase) && !pending;
  const c = GOALS_COPY.ledger;
  return (
    <Sheet title={c.withdrawTitle} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <MoneyField
          label={c.amount}
          value={raw}
          onChange={setRaw}
          error={parseError ?? (tooMuch ? c.exceeds : error)}
        />
        {valid && <WithdrawTradeoffNotice amount={value} monthlyPace={monthlyPace} />}
        <CommitmentPhraseInput phrase={phrase} value={typed} onChange={setTyped} />
        {formError != null && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {formError || GOALS_COPY.actionError}
          </p>
        )}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => valid && onSubmit({ amount: value, note: phrase })}
          className={primaryButton}
        >
          {c.submitWithdraw}
        </button>
      </div>
    </Sheet>
  );
}
