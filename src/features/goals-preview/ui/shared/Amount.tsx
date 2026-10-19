import { Money } from "@/components/primitives";
import { cn } from "@/lib/cn";
import type { ValueSource } from "../../model/types";
import { SourceTag } from "./SourceTag";

/** VND amount + its source tag. `amount="unknown"` renders "chưa rõ". */
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
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Money amount={amount} sign={sign} showPlus={showPlus} unknownLabel={unknownLabel} />
      {source && <SourceTag source={source} />}
    </span>
  );
}
