import { Bell } from "lucide-react";
import { MsbLogoMark } from "./MsbLogoMark";

/**
 * Header Home MSB (tĩnh — on-scroll loại khỏi scope): dấu hiệu M cam + chữ "MSB"
 * đen bên trái; chuông trong nút tròn trắng + badge số bên phải. Đè trên hero
 * gradient. Presentation-only.
 */
export function HomeHeader({ notifications = 0 }: { notifications?: number }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-2" aria-label="MSB">
        <MsbLogoMark className="h-7 w-9" />
        <span className="text-2xl font-black tracking-tight text-text">MSB</span>
      </div>
      <button
        type="button"
        aria-label={`Thông báo${notifications ? `: ${notifications} chưa đọc` : ""}`}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-text shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Bell size={20} strokeWidth={2} />
        {notifications > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-fg">
            {notifications > 99 ? "99+" : notifications}
          </span>
        )}
      </button>
    </div>
  );
}
