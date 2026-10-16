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

/** Small accessible pill indicating the provenance of a value. */
export function SourceBadge({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
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
