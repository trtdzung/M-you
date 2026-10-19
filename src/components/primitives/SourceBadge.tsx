import { cn } from "@/lib/cn";
import { SOURCE_FULL_LABEL } from "@/lib/source-labels";

export type Source = "msb" | "self_reported" | "estimated" | "mock";

const SOURCE_META: Record<Source, { label: string; className: string }> = {
  msb: {
    label: "MSB",
    className: "bg-source-msb-soft text-source-msb",
  },
  self_reported: {
    label: "Tự khai",
    className: "bg-source-self-soft text-source-self",
  },
  estimated: {
    label: "Ước tính",
    className: "bg-source-estimated-soft text-source-estimated",
  },
  mock: {
    label: "Demo",
    className: "bg-source-mock-soft text-source-mock",
  },
};

/**
 * Set to true to show the provenance pills again. They are hidden app-wide at the
 * product owner's request: in an all-mock demo the source pills (DEMO / TỰ KHAI /
 * ƯỚC TÍNH / MSB) sat on nearly every value and read as debug annotations. The
 * provenance data model is untouched — the engine still tracks `source` on every
 * aggregate (invariant #5's data requirement); only the visible chip is hidden.
 */
const SHOW_SOURCE_BADGE: boolean = false;

/**
 * Whether a `SourceBadge` for `source` would render anything. Layouts that wrap the
 * badge in a container use this so they never draw an empty box while badges are off.
 */
export function sourceBadgeVisible(source: Source | null | undefined): source is Source {
  return SHOW_SOURCE_BADGE && source != null;
}

/** Small accessible pill indicating the provenance of a value. */
export function SourceBadge({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
  if (!sourceBadgeVisible(source)) return null;
  const meta = SOURCE_META[source];
  return (
    <span
      title={SOURCE_FULL_LABEL[source]}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
