import { isUnknownAmount } from "@/lib/format";
import { formatVnd } from "../../format-money";
import { cn } from "@/lib/cn";
import type { ValueSource } from "../../model/types";
import { SOURCE_TITLE } from "../../model/labels";

/** VND amount with source metadata; visible source labels belong to its group. */
export function Amount({
  amount,
  source,
  className,
  sign,
  showPlus,
  unknownLabel,
}: {
  amount: number | "unknown" | undefined;
  source?: ValueSource;
  className?: string;
  sign?: "credit" | "debit";
  showPlus?: boolean;
  unknownLabel?: string;
}) {
  return (
    <span title={source ? SOURCE_TITLE[source] : undefined} aria-description={source ? SOURCE_TITLE[source] : undefined} className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("tabular-nums", sign === "credit" && "text-positive", sign === "debit" && "text-text", isUnknownAmount(amount) && "text-muted")}>
        {isUnknownAmount(amount) ? unknownLabel ?? "chưa rõ" : `${sign === "debit" || (amount as number) < 0 ? "−" : showPlus && (sign === "credit" || (amount as number) > 0) ? "+" : ""}${formatVnd(Math.abs(amount as number))}`}
      </span>
    </span>
  );
}
