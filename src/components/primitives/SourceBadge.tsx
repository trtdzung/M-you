import { cn } from "@/lib/cn";

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

const FULL_LABEL: Record<Source, string> = {
  msb: "Dữ liệu từ MSB",
  self_reported: "Người dùng tự khai báo",
  estimated: "Giá trị ước tính",
  mock: "Dữ liệu demo",
};

/**
 * Set to true to show the provenance pills again. They are hidden app-wide at the
 * product owner's request: in an all-mock demo the source pills (DEMO / TỰ KHAI /
 * ƯỚC TÍNH / MSB) sat on nearly every value and read as debug annotations. The
 * provenance data model is untouched — the engine still tracks `source` on every
 * aggregate (invariant #5's data requirement); only the visible chip is hidden.
 */
const SHOW_SOURCE_BADGE: boolean = false;

/** Small accessible pill indicating the provenance of a value. */
export function SourceBadge({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
  if (!SHOW_SOURCE_BADGE) return null;
  const meta = SOURCE_META[source];
  return (
    <span
      title={FULL_LABEL[source]}
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
