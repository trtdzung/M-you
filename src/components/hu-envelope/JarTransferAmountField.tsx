import { useId } from "react";

const groupFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Digits only → whole VND, or `null` when empty (thousand dots are display-only). */
export function parseAmountInput(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, 15);
  return digits === "" ? null : Number(digits);
}

/**
 * "SỐ TIỀN" input: numeric keypad, digits only, thousand-grouped as the user
 * types, plus a "Tối đa" shortcut that fills the source's cap. The error sits
 * under the field (`role="alert"`, wired by `aria-describedby`).
 */
export function JarTransferAmountField({
  amount,
  cap,
  error,
  onChange,
  onBlur,
}: {
  amount: number | null;
  /** The source's cap; "Tối đa" is disabled when it is `null` or 0. */
  cap: number | null;
  error: string | null;
  onChange: (amount: number | null) => void;
  onBlur: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-wide text-muted">
          Số tiền
        </label>
        <button
          type="button"
          onClick={() => cap !== null && onChange(cap)}
          disabled={cap === null || cap === 0}
          className="min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Tối đa
        </button>
      </div>
      <div className="flex items-center rounded-xl border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-primary/50">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={amount === null ? "" : groupFormatter.format(amount)}
          onChange={(e) => onChange(parseAmountInput(e.target.value))}
          onBlur={onBlur}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-text outline-none"
        />
        <span className="text-sm text-muted">₫</span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
