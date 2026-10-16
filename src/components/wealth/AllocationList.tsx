import type { NetWorthItem } from "@/domain/engine";
import { Money, SourceBadge } from "@/components/primitives";
import { cn } from "@/lib/cn";

const ASSET_TYPE_LABEL: Record<string, string> = {
  cash: "Tiền mặt", deposit: "Tiền gửi", fund: "Quỹ", stock: "Cổ phiếu", gold: "Vàng",
  real_estate: "Bất động sản", vehicle: "Phương tiện", other: "Khác",
  credit_card: "Thẻ tín dụng", personal_loan: "Vay tiêu dùng", mortgage: "Vay mua nhà", instalment: "Trả góp",
};

/** Flat allocation list of assets and liabilities with provenance. */
export function AllocationList({ items }: { items: NetWorthItem[] }) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  return (
    <ul className="flex flex-col divide-y divide-border">
      {sorted.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-2.5">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", item.kind === "asset" ? "bg-positive" : "bg-negative")} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-text">{item.label}</span>
              <SourceBadge source={item.source} />
            </div>
            <span className="text-xs text-muted">{ASSET_TYPE_LABEL[item.type] ?? item.type}</span>
          </div>
          <Money
            amount={item.amount}
            className={cn("shrink-0 text-sm font-semibold", item.kind === "liability" && "text-negative")}
          />
        </li>
      ))}
    </ul>
  );
}
