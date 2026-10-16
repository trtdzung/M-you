import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Headphones, Search } from "lucide-react";

/**
 * Header Home MSB (tĩnh — on-scroll loại khỏi scope): logo MSB trắng (bản đảo màu
 * thật, crop từ bộ nhận diện) bên trái; ba nút tròn kính-trắng mờ (tìm kiếm · hỗ
 * trợ · thông báo + badge) bên phải — khớp preview "2/9". Đè trên hero nền đỏ.
 * Presentation-only.
 */
export function HomeHeader({ notifications = 0 }: { notifications?: number }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between bg-gradient-to-b from-brand-red/70 to-transparent px-4 pb-3 pt-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/msb-logo-white.png" alt="MSB" className="h-9 w-auto" />
      <div className="flex items-center gap-2">
        <IconButton icon={Search} label="Tìm kiếm" />
        {/* Headset = MSB-native anchor for the assistant → second entry to /assistant. */}
        <IconButton icon={Headphones} label="Trợ lý MSB" href="/assistant" />
        <IconButton icon={Bell} label="Thông báo" badge={notifications} />
      </div>
    </div>
  );
}

/**
 * Nút tròn kính-mờ, icon trắng — tương phản đạt trên nền đỏ "2/9" toàn màn.
 * Render as a `Link` when `href` is given (e.g. the headset → assistant), else a button.
 */
function IconButton({
  icon: Icon,
  label,
  badge = 0,
  href,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  href?: string;
}) {
  const ariaLabel = badge ? `${label}: ${badge} chưa đọc` : label;
  const className =
    "relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white shadow-sm backdrop-blur-md transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
  const inner = (
    <>
      <Icon size={19} strokeWidth={2} />
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-fg shadow-sm">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={ariaLabel} className={className}>
      {inner}
    </button>
  );
}
