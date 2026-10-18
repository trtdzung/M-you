"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/primitives";
import type { LucideIcon } from "lucide-react";
import { Bell, Search } from "lucide-react";

/**
 * Header Home MSB (tĩnh — on-scroll loại khỏi scope): logo MSB trắng (bản đảo màu
 * thật, crop từ bộ nhận diện) bên trái; hai nút tròn kính-trắng mờ (tìm kiếm ·
 * thông báo + badge) bên phải — khớp preview "2/9". Đè trên hero nền đỏ.
 * Presentation-only.
 */
export function HomeHeader({ notifications = 0 }: { notifications?: number }) {
  const [panel, setPanel] = useState<string | null>(null);
  return (
    <>
    <div className="login-topbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/msb-logo-white.png" alt="MSB" className="h-9 w-auto" />
      <div className="flex items-center gap-2">
        <IconButton icon={Search} label="Tìm kiếm" onClick={() => setPanel("Tìm kiếm dịch vụ")} />
        <IconButton icon={Bell} label="Thông báo" badge={notifications} onClick={() => setPanel("Thông báo")} />
      </div>
    </div>
    <Sheet open={panel !== null} title={panel ?? " "} onClose={() => setPanel(null)}>{panel === "Thông báo" ? <p className="pb-5 text-sm text-muted">Bạn chưa có thông báo mới trong phiên demo.</p> : panel ? <div className="flex flex-col gap-2 pb-4">{[["Chuyển tiền", "/transfer"], ["Tài sản", "/accounts"], ["Cài đặt", "/settings"], ["Quản lý tài chính PFM", "/pfm"]].map(([label, href]) => <Link key={href} href={href} className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold">{label}</Link>)}</div> : null}</Sheet>
    </>
  );
}

/** Nút tròn kính-mờ, icon trắng — tương phản đạt trên nền đỏ "2/9" toàn màn. */
function IconButton({
  icon: Icon,
  label,
  badge = 0,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  const ariaLabel = badge ? `${label}: ${badge} chưa đọc` : label;
  const className =
    "login-icon-button relative";
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      <Icon size={19} strokeWidth={2} />
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-fg shadow-sm">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
