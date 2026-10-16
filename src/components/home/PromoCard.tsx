import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { SourceBadge } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * Banner ưu đãi TĨNH `source: mock` (Red Team #1) — KHÔNG mang số gắn dữ liệu tài
 * chính người dùng. Hai kiểu: "offer" (icon + tiêu đề + chevron + body + highlight
 * + CTA) và "banner" (dải peach quảng bá). Card insight thật dùng `InsightCard`
 * riêng, KHÔNG dùng component này.
 */
export function PromoCard({
  icon: Icon,
  title,
  body,
  highlight,
  cta,
  variant = "offer",
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  highlight?: string;
  cta?: string;
  variant?: "offer" | "banner";
}) {
  if (variant === "banner") {
    return (
      <article className="shadow-card relative flex h-full min-h-[104px] flex-col justify-center gap-1 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#FCE0CC] to-[#FBEFE3] p-5">
        <div className="flex items-center gap-2 text-text">
          <Icon size={20} className="text-primary" />
          <span className="text-sm font-bold">{title}</span>
        </div>
        {body && <p className="text-xs font-medium text-ink-soft">{body}</p>}
        <SourceBadge source="mock" className="absolute right-3 top-3" />
      </article>
    );
  }

  return (
    <article className="shadow-card flex h-full flex-col rounded-[20px] bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon size={18} />
        </span>
        <span className="flex-1 text-[15px] font-bold text-text">{title}</span>
        <ChevronRight size={20} className="text-muted" />
      </div>
      {body && <p className="mt-3 text-sm leading-snug text-muted">{body}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        {highlight && (
          <span className={cn("text-lg font-bold text-primary")}>{highlight}</span>
        )}
        {cta && (
          <span className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary">
            {cta}
          </span>
        )}
      </div>
      <SourceBadge source="mock" className="mt-3 self-start" />
    </article>
  );
}
