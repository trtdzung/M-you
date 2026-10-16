import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type QuickAction = {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
};

function ActionCell({ action, layout }: { action: QuickAction; layout: "grid" | "row" }) {
  const Icon = action.icon;
  const cell =
    layout === "grid"
      ? "flex min-h-[44px] flex-col items-center justify-center gap-2 rounded-[16px] px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      : "flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
  const inner = (
    <>
      <Icon size={layout === "grid" ? 26 : 22} strokeWidth={1.8} className="text-text" />
      <span className="text-[12px] font-medium leading-tight text-text">{action.label}</span>
    </>
  );
  if (action.href) {
    // Hash = cuộn cùng trang (native anchor); route nội bộ = Link (client-side).
    return action.href.startsWith("#") ? (
      <a href={action.href} className={cell}>
        {inner}
      </a>
    ) : (
      <Link href={action.href} className={cell}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cell}>
      {inner}
    </button>
  );
}

/**
 * Lưới icon+label kiểu khối quick-actions MSB (peach card, 3 cột), có thể kèm
 * hàng chân (Rewards/Trợ lý AI/Xem thêm) ngăn bởi divider. Reusable; presentation-only.
 */
export function QuickActions({
  actions,
  footer,
  className,
}: {
  actions: QuickAction[];
  footer?: QuickAction[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-white/40 bg-white/70 p-5 backdrop-blur-xl",
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-x-2 gap-y-5">
        {actions.map((a) => (
          <ActionCell key={a.label} action={a} layout="grid" />
        ))}
      </div>
      {footer && footer.length > 0 && (
        <>
          <div className="my-4 h-px bg-border" />
          <div
            className="flex items-center justify-around"
            style={{ gap: "0.5rem" }}
          >
            {footer.map((a) => (
              <ActionCell key={a.label} action={a} layout="row" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
