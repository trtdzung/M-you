import { cn } from "@/lib/cn";
import { formatVnd, isUnknownAmount, type MaybeAmount } from "@/lib/format";

/**
 * Renders a VND amount. Unknown values show "chưa rõ" (— by default).
 * `sign` optionally colors the value: credit = positive/green, debit = default.
 */
export function Money({
  amount,
  sign,
  className,
  unknownLabel = "chưa rõ",
  showPlus = false,
}: {
  amount: MaybeAmount;
  sign?: "credit" | "debit";
  className?: string;
  unknownLabel?: string;
  showPlus?: boolean;
}) {
  if (isUnknownAmount(amount)) {
    return (
      <span className={cn("tabular-nums text-muted", className)} title="Chưa rõ">
        {unknownLabel}
      </span>
    );
  }

  const value = amount as number;
  const formatted = formatVnd(Math.abs(value));
  const isCredit = sign === "credit" || (sign === undefined && value > 0 && showPlus);
  const prefix =
    sign === "debit" || value < 0 ? "-" : showPlus && isCredit ? "+" : "";

  return (
    <span
      className={cn(
        "tabular-nums",
        sign === "credit" && "text-positive",
        sign === "debit" && "text-text",
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  );
}
