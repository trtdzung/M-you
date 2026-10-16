import Link from "next/link";
import { TrendingUp, Wallet, Lightbulb, ChevronRight, type LucideIcon } from "lucide-react";

type Entry = { href: string; label: string; desc: string; icon: LucideIcon };

const ENTRIES: Entry[] = [
  { href: "/pfm/cashflow", label: "Dòng tiền", desc: "Thu, chi, ngân sách theo tháng", icon: TrendingUp },
  { href: "/pfm/wealth", label: "Tài sản", desc: "Tài sản, khoản nợ & xu hướng", icon: Wallet },
  { href: "/pfm/insights", label: "Gợi ý", desc: "Nhận định dựa trên dữ liệu của bạn", icon: Lightbulb },
];

/** Điều hướng nội bộ PFM hub — sub-route (deep-link), list card kiểu MSB. */
export function PfmHubNav() {
  return (
    <div className="flex flex-col gap-3">
      {ENTRIES.map(({ href, label, desc, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="shadow-card flex min-h-[64px] items-center gap-3 rounded-[20px] bg-surface p-4 transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{label}</p>
            <p className="truncate text-xs text-muted">{desc}</p>
          </div>
          <ChevronRight size={20} className="shrink-0 text-muted" />
        </Link>
      ))}
    </div>
  );
}
