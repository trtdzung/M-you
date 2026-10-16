import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type QuickAction = {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
};

/**
 * Lưới icon+label kiểu khối quick-actions MSB (peach card, 3 cột).
 * Reusable; presentation-only.
 */
export function QuickActions({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-x-2 gap-y-5 rounded-[24px] bg-surface-tint p-5",
        className,
      )}
    >
      {actions.map((a) => {
        const Icon = a.icon;
        const cell =
          "flex min-h-[44px] flex-col items-center justify-center gap-2 rounded-[16px] px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
        const inner = (
          <>
            <Icon size={26} strokeWidth={1.8} className="text-text" />
            <span className="text-[12px] font-medium leading-tight text-text">
              {a.label}
            </span>
          </>
        );
        if (a.href) {
          // Hash = cuộn cùng trang (native anchor); route nội bộ = Link (client-side).
          return a.href.startsWith("#") ? (
            <a key={a.label} href={a.href} className={cell}>
              {inner}
            </a>
          ) : (
            <Link key={a.label} href={a.href} className={cell}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={a.label} type="button" onClick={a.onClick} className={cell}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
