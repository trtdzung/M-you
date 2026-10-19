import { cn } from "@/lib/cn";
import { SOURCE_LABEL, SOURCE_TITLE } from "../../model/labels";
import type { ValueSource } from "../../model/types";

const TONE: Record<ValueSource, string> = {
  msb: "bg-source-msb-soft text-source-msb",
  self_reported: "bg-source-self-soft text-source-self",
  estimated: "bg-source-estimated-soft text-source-estimated",
};

/**
 * Group-level provenance pill (MSB / Tự khai / Ước tính).
 * Amounts inherit the group source instead of repeating this pill.
 */
export function SourceTag({ source, className }: { source: ValueSource; className?: string }) {
  return (
    <span
      title={SOURCE_TITLE[source]}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide",
        TONE[source],
        className,
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}
