import { Search, Bell } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Hàng thương hiệu MSB: logo M + tìm kiếm + chuông (badge).
 * `tone`: "dark" (navy trên blush) hoặc "light" (trắng trên gradient). Presentation-only.
 */
export function BrandHeader({
  notifications = 0,
  tone = "dark",
}: {
  notifications?: number;
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  const iconBtn = cn(
    "flex h-10 w-10 items-center justify-center rounded-full",
    light ? "text-primary-fg hover:bg-white/15" : "text-text hover:bg-surface-tint",
  );

  return (
    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-2" aria-label="MSB">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl text-base font-black text-primary-fg",
            light ? "bg-white/20" : "brand-gradient",
          )}
          aria-hidden="true"
        >
          M
        </span>
        <span
          className={cn(
            "text-xl font-extrabold tracking-tight",
            light ? "text-primary-fg" : "text-text",
          )}
        >
          MSB
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Tìm kiếm" className={iconBtn}>
          <Search size={20} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={`Thông báo${notifications ? `: ${notifications} chưa đọc` : ""}`}
          className={cn("relative", iconBtn)}
        >
          <Bell size={20} strokeWidth={2} />
          {notifications > 0 && (
            <span
              className={cn(
                "absolute right-1.5 top-1 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-4",
                light ? "bg-white text-primary" : "bg-primary text-primary-fg",
              )}
            >
              {notifications > 99 ? "99+" : notifications}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
